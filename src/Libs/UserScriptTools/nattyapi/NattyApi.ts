declare const GM_xmlhttpRequest: any;

import { Observable, Subject, ReplaySubject,firstValueFrom } from 'rxjs';
import { take } from 'rxjs/operators';
import { IsStackOverflow } from '@userscriptTools/sotools/sotools';
import { ChatApi } from '@userscriptTools/chatapi/ChatApi';
import * as globals from '../../../GlobalVars';

export interface NattyFeedbackItemInfo {
    timestamp: number;
    naaValue: number;
    bodyLength: number;
    reputation: number;
    reasons: { reasonName: string }[];
    link: string;
    name: string;
    type: 'None' | 'True Positive' | 'False Positive' | 'Needs Editing';
}
export interface NattyFeedbackInfo {
    items: [null] | NattyFeedbackItemInfo[];
    message: 'success';
}

export class NattyAPI {
    private chat: ChatApi = new ChatApi();
    private answerId: number;
    private subject: Subject<boolean> = new Subject<boolean>();
    private replaySubject: ReplaySubject<boolean> = new ReplaySubject<boolean>();

    constructor(answerId: number) {
        this.answerId = answerId;
    }

    public Watch(): Observable<boolean> {
        this.subject.subscribe(this.replaySubject);

        if (IsStackOverflow()) {
            new Promise<boolean>((resolve, reject) => {
                let numTries = 0;
                const onError = (response: any) => {
                    numTries++;
                    numTries < 3 ? makeRequest() : reject('Failed to retrieve natty report: ' + response);
                };

                const makeRequest = () => {
                    GM_xmlhttpRequest({
                        method: 'GET',
                        url: `${globals.nattyFeedbackUrl}/${this.answerId}`,
                        onload: (response: XMLHttpRequest) => {
                            if (response.status === 200) {
                                const nattyResult = JSON.parse(response.responseText);
                                resolve(nattyResult.items && nattyResult.items[0]);
                            } else {
                                onError(response.responseText);
                            }
                        },
                        onerror: (response: any) => {
                            onError(response);
                        },
                    });
                };

                makeRequest();
            })
                .then(r => this.subject.next(r))
                .catch(err => this.subject.error(err));
        }

        return this.subject;
    }

    public async ReportNaa(answerDate: Date, questionDate: Date) {
        if (answerDate < questionDate) {
            throw new Error('Answer must be posted after the question');
        }
        if (!IsStackOverflow()) {
            return false;
        }
        if (await this.WasReported()) {
            await this.chat.SendMessage(globals.soboticsRoomId, `@Natty feedback https://stackoverflow.com/a/${this.answerId} tp`);
            return true;
        } else {
            const answerAge = this.DaysBetween(answerDate, new Date());
            const daysPostedAfterQuestion = this.DaysBetween(questionDate, answerDate);
            if (isNaN(answerAge)) {
                throw new Error('Invalid answerDate provided');
            }
            if (isNaN(daysPostedAfterQuestion)) {
                throw new Error('Invalid questionDate provided');
            }
            if (answerAge > 30 || daysPostedAfterQuestion < 30) {
                return false;
            }

            const promise = this.chat.SendMessage(globals.soboticsRoomId, `@Natty report https://stackoverflow.com/a/${this.answerId}`);
            await promise.then(() => this.subject.next(true));
            return true;
        }
    }
    public async ReportRedFlag() {
        if (!IsStackOverflow()) {
            return false;
        }
        if (await this.WasReported()) {
            await this.chat.SendMessage(globals.soboticsRoomId, `@Natty feedback https://stackoverflow.com/a/${this.answerId} tp`);
            return true;
        }
        return false;
    }
    public async ReportLooksFine() {
        if (!IsStackOverflow()) {
            return false;
        }
        if (await this.WasReported()) {
            await this.chat.SendMessage(globals.soboticsRoomId, `@Natty feedback https://stackoverflow.com/a/${this.answerId} fp`);
            return true;
        }
        return false;
    }
    public async ReportNeedsEditing() {
        if (!IsStackOverflow()) {
            return false;
        }
        if (await this.WasReported()) {
            await this.chat.SendMessage(globals.soboticsRoomId, `@Natty feedback https://stackoverflow.com/a/${this.answerId} ne`);
            return true;
        }
        return false;
    }

    private async WasReported() {
        return await firstValueFrom(this.replaySubject.pipe(take(1)));
    }

    private DaysBetween(first: Date, second: Date) {
        return ((second as any) - (first as any)) / (1000 * 60 * 60 * 24);
    }
}
