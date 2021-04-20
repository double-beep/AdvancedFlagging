import { ChatApi } from './ChatApi';
import { isStackOverflow, copyPastorServer, username, copyPastorKey, getSentMessage, FlagTypeFeedbacks } from '../GlobalVars';
import { getAllPostIds } from './sotools';

interface CopyPastorFindTargetResponseItem {
    post_id: string;
    target_url: string;
    repost: boolean;
    original_url: string;
}

type CopyPastorFindTargetResponse = {
    status: 'success';
    posts: CopyPastorFindTargetResponseItem[];
} | {
    status: 'failure';
    message: string;
};

export class CopyPastorAPI {
    private static copyPastorIds: { postId: number, repost: boolean, target_url: string }[] = [];
    private answerId?: number;
    public name: keyof FlagTypeFeedbacks = 'Guttenberg';

    constructor(id: number) {
        this.answerId = id;
    }

    public static async getAllCopyPastorIds(): Promise<void> {
        if (!isStackOverflow) return;

        const postUrls = getAllPostIds(false, true);
        await this.storeReportedPosts(postUrls as string[]);
    }

    private static storeReportedPosts(postUrls: string[]): Promise<void> {
        const url = `${copyPastorServer}/posts/findTarget?url=${postUrls.join(',')}`;
        return new Promise<void>((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url,
                onload: (response: { responseText: string }) => {
                    const responseObject = JSON.parse(response.responseText) as CopyPastorFindTargetResponse;
                    if (responseObject.status === 'failure') return;
                    responseObject.posts.forEach(item => {
                        this.copyPastorIds.push({ postId: Number(item.post_id), repost: item.repost, target_url: item.target_url });
                    });
                    resolve();
                },
                onerror: () => reject()
            });
        });
    }

    public getCopyPastorId(): number {
        return CopyPastorAPI.copyPastorIds.find(item => item.postId === this.answerId)?.postId || 0;
    }

    public getIsRepost(): boolean {
        return CopyPastorAPI.copyPastorIds.find(item => item.postId === this.answerId)?.repost || false;
    }

    public getTargetUrl(): string {
        return CopyPastorAPI.copyPastorIds.find(item => item.postId === this.answerId)?.target_url || '';
    }

    public SendFeedback(feedback: string): Promise<string> {
        const chatId = new ChatApi().GetChatUserId();
        const copyPastorId = this.getCopyPastorId();
        if (!copyPastorId) return Promise.resolve('');

        const successMessage = getSentMessage(true, feedback, this.name);
        const failureMessage = getSentMessage(false, feedback, this.name);
        const payload = {
            post_id: copyPastorId,
            feedback_type: feedback,
            username,
            link: `https://chat.stackoverflow.com/users/${chatId}`,
            key: copyPastorKey,
        };

        return new Promise<string>((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'POST',
                url: `${copyPastorServer}/feedback/create`,
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                data: Object.entries(payload).map(item => item.join('=')).join('&'),
                onload: (response: { status: number }) => {
                    response.status === 200 ? resolve(successMessage) : reject(failureMessage);
                },
                onerror: () => reject(failureMessage)
            });
        });
    }
}
