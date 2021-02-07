import { MetaSmokeAPI} from '@userscriptTools/metasmokeapi/MetaSmokeAPI';
import { flagCategories } from 'FlagTypes';
import { GreaseMonkeyCache } from '@userscriptTools/caching/GreaseMonkeyCache';
import * as globals from './GlobalVars';

declare const Stacks: any;
declare const Svg: any;

export async function SetupConfiguration() {
    while (typeof Svg === 'undefined') {
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    const bottomBox = $('.site-footer--copyright').children('.-list');
    const configurationDiv = globals.configurationDiv.clone();

    SetupDefaults();
    BuildConfigurationOverlay();
    const configurationLink = globals.configurationLink.clone();
    $(document).on('click', '#af-modal-button', () => Stacks.showModal(document.querySelector('#af-config')));
    configurationDiv.append(configurationLink);
    configurationDiv.insertAfter(bottomBox);
}

function getFlagTypes() {
    const flagTypes: { Id: number, DisplayName: string }[] = [];
    flagCategories.forEach(flagCategory => {
        flagCategory.FlagTypes.forEach(flagType => {
            flagTypes.push({
                Id: flagType.Id,
                DisplayName: flagType.DisplayName
            });
        });
    });
    return flagTypes;
}

function SetupDefaults() {
    const configurationEnabledFlags = GreaseMonkeyCache.GetFromCache<number[]>(globals.ConfigurationEnabledFlags);
    if (!configurationEnabledFlags) {
        const flagTypeIds = getFlagTypes().map(f => f.Id);
        GreaseMonkeyCache.StoreInCache(globals.ConfigurationEnabledFlags, flagTypeIds);
    }
}

function BuildConfigurationOverlay() {
    const overlayModal = globals.overlayModal;
    overlayModal.find('.s-modal--close').append(Svg.ClearSm());

    const sections: ConfigSection[] = [
        {
            SectionName: 'General',
            Items: GetGeneralConfigItems(),
            onSave: () => {
                $('.af-section-general').find('input').each((_index, el) => {
                    GreaseMonkeyCache.StoreInCache($(el).parents().eq(2).data('option-id'), $(el).prop('checked'));
                });
            }
        },
        {
            SectionName: 'Flags',
            Items: GetFlagSettings(),
            onSave: () => {
                const flagOptions = $('.af-section-flags').find('input').get().filter(el => $(el).prop('checked')).map(el => Number($(el).attr('id').match(/\d+/)));
                GreaseMonkeyCache.StoreInCache(globals.ConfigurationEnabledFlags, flagOptions);
            }
        },
        {
            SectionName: 'Admin',
            Items: GetAdminConfigItems()
        }
    ];

    let firstSection = true;
    sections.forEach(section => {
        if (!firstSection) overlayModal.find('#af-modal-description').append('<hr>');
        firstSection = false;

        const sectionWrapper = globals.getSectionWrapper(section.SectionName);
        overlayModal.find('#af-modal-description').append(sectionWrapper);

        section.Items.forEach((element: JQuery) => sectionWrapper.append(element));
    });

    const okayButton = overlayModal.find('.s-btn__primary');
    okayButton.click((event) => {
        event.preventDefault();
        sections.forEach(section => {
            if (section.onSave) section.onSave();
        });
        globals.displayStacksToast('Configuration saved', 'success');
        setTimeout(window.location.reload.bind(window.location), 500);
    });

    $('body').append(overlayModal);
    $('label[for="flag-type-12"]').parent().removeClass('w25').css('width', '20.8%'); // because without it, the CSS breaks
    const flagOptions = $('.af-section-flags').children('div');
    for (let i = 0; i < flagOptions.length; i += 5) {
        flagOptions.slice(i, i + 5).wrapAll(globals.inlineCheckboxesWrapper.clone());
    }
}

function GetGeneralConfigItems() {
    const checkboxArray: JQuery[] = [];
    const options = [
        {
            text: 'Open dropdown on hover',
            configValue: globals.ConfigurationOpenOnHover
        },
        {
            text: 'Watch for manual flags',
            configValue: globals.ConfigurationWatchFlags
        },
        {
            text: 'Watch for queue responses',
            configValue: globals.ConfigurationWatchQueues
        },
        {
            text: 'Disable AdvancedFlagging link',
            configValue: globals.ConfigurationLinkDisabled
        },
        {
            text: 'Uncheck \'Comment\' by default',
            configValue: globals.ConfigurationDefaultNoComment
        },
        {
            text: 'Uncheck \'flag\' by default',
            configValue: globals.ConfigurationDefaultNoFlag
        },
    ];
    options.forEach(el => {
        const storedValue: boolean | undefined =  GreaseMonkeyCache.GetFromCache(el.configValue);
        checkboxArray.push(createCheckbox(el.text, storedValue).attr('data-option-id', el.configValue));
    });
    return checkboxArray;
}

function GetFlagSettings() {
    const checkboxes: JQuery[] = [];
    const flagTypeIds = GreaseMonkeyCache.GetFromCache<number[]>(globals.ConfigurationEnabledFlags) || [];

    getFlagTypes().forEach(f => {
        const storedValue = flagTypeIds.indexOf(f.Id) > -1;
        checkboxes.push(createCheckbox(f.DisplayName, storedValue, 'flag-type-' + f.Id).children().eq(0).addClass('w25'));
    });
    return checkboxes;
}

function GetAdminConfigItems() {
    return [
        $('<a>').text('Clear expired items from cache').click(() => GreaseMonkeyCache.ClearExpiredKeys()),
        $('<a>').text('Clear Metasmoke Configuration').click(async () => { await MetaSmokeAPI.Reset(); }),
        $('<a>').text('Get MetaSmoke key').attr('href', `https://metasmoke.erwaysoftware.com/oauth/request?key=${globals.metaSmokeKey}`),
        $('<a>').text('Manually register MetaSmoke key').click(() => {
            const prompt = window.prompt('Enter metasmoke key');
            if (prompt) {
                GreaseMonkeyCache.StoreInCache(globals.MetaSmokeDisabledConfig, false);
                localStorage.setItem('MetaSmoke.ManualKey', prompt);
            }
        }),
        $('<a>').text('Clear chat FKey').click(() => {
            const fkeyCacheKey = `StackExchange.ChatApi.FKey_${globals.soboticsRoomId}`;
            GreaseMonkeyCache.Unset(fkeyCacheKey);
        })
    ].map(item => item.wrap(globals.gridCellDiv.clone()).parent());
}

function createCheckbox(text: string, storedValue: boolean | undefined, optionId: string = text.toLowerCase().replace(/\s/g, '_')): JQuery {
    const configHTML = globals.getConfigHtml(optionId, text);
    const input = configHTML.find('input');
    if (storedValue) input.prop('checked', true);

    return configHTML;
}

interface ConfigSection {
    SectionName: string;
    Items: JQuery[];
    onSave?: any;
}
