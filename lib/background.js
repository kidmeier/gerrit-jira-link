/* Click on Extension Icon */

chrome.action.onClicked.addListener(async () => {
	const gerritHost = await getGerritHost();

	chrome.tabs.query({active: true, currentWindow: true}, tabs => {
		chrome.tabs.sendMessage(tabs[0].id, {
			type: 'toggleNativePopup',
			configured: !!gerritHost,
			host: gerritHost
		});
	});
});


/* Active Tab Change */

let previousActiveTabId = '';

chrome.tabs.onActivated.addListener(active => {
	if (previousActiveTabId){ notifyTabOfActiveTabChange(previousActiveTabId); }
	notifyTabOfActiveTabChange(active.tabId);
	previousActiveTabId = active.tabId;
});

function notifyTabOfActiveTabChange(tabId){
	chrome.tabs.sendMessage(tabId, {
		type: 'activeTabChange'
	});
}


/* Gerrit Response */

function setLastGerritResponse(status, tabId){
	chrome.tabs.sendMessage(tabId, {
		type: 'setLastGerritResponse',
		status
	});
}


/* Messages */

chrome.runtime.onMessage.addListener(handleMessage);

function handleMessage(message, sender, sendResponse){
	switch (message.type) {
		case 'tryGetChangesByJiraKey':
			tryGetChangesByJiraKey(message.jiraKey, sender.tab.id, sendResponse);
			break;
		case 'setListBadge':
			setListBadge(message.value, sender.tab.id);
			break;
		case 'setGerritHost':
			setGerritHost(message.host, sender.tab.id, sendResponse);
			break;
		case 'setGerritQuery':
			setGerritQuery(message.query, sender.tab.id, sendResponse);
			break;
		case 'getGerritQuery':
			getGerritQuery().then(query => sendResponse(query));
			break;
	}
	return true;
}

function purgeLocalChanges(tabId){
	chrome.tabs.sendMessage(tabId, {
		type: 'purgeLocalChanges'
	});
}


/* Gerrit */

async function tryGetChangesByJiraKey(jiraKey, tabId, sendResponse){
	const gerritHost = await getGerritHost();
	if (gerritHost) {
		try{
			const result = await getChangesByJiraKey(jiraKey);
			sendResponse(result.data);
			setLastGerritResponse(result.status, tabId);
		}catch(err){
			sendResponse([]);
			setLastGerritResponse(0, tabId);
		}
	}else{
		setConfigNeededBadge(tabId);
		purgeLocalChanges(tabId);
	}
}

async function getChangesByJiraKey(jiraKey){
	const gerritHost = await getGerritHost();
	const queryTemplate = await getGerritQuery();
	const query = queryTemplate.replace(/\$\{jiraKey\}/g, jiraKey);
	const response = await fetch(`https://${gerritHost}/a/changes/?q=${encodeURIComponent(query)}&n=15`);

	if (response.status !== 200){
		return {
			status: response.status,
			data: []
		}
	}

	const responseText = await response.text();
	const trimmedText = responseText.substring(4);
	const json = JSON.parse(trimmedText);
	return {
		status: response.status,
		data: json
	};
}


/* Badge */

function setConfigNeededBadge(tabId){
	setBadge('?', tabId);
	setBadgeColor('rgb(254, 80, 0)', tabId);
}

function setListBadge(value, tabId){
	setBadge(value, tabId);
	setBadgeColor('rgb(0, 82, 204)', tabId);
}

function setBadge(value, tabId){
	chrome.action.setBadgeText({
		tabId,
		text: value ? value.toString() : ''
	});
}

function setBadgeColor(color, tabId){
	chrome.action.setBadgeBackgroundColor({
		tabId,
		color
	});
}


/* Local Storage */

async function setGerritHost(host, tabId, sendResponse){
	await chrome.storage.local.set({ gerritHost: host });
	sendResponse();
	setListBadge('', tabId);
}

async function getGerritHost(){
	const data = await chrome.storage.local.get(['gerritHost']);
	return data['gerritHost'];
}

const DEFAULT_GERRIT_QUERY = 'tr:${jiraKey}';

async function setGerritQuery(query, tabId, sendResponse){
	await chrome.storage.local.set({ gerritQuery: query });
	sendResponse();
	setListBadge('', tabId);
}

async function getGerritQuery(){
	const data = await chrome.storage.local.get(['gerritQuery']);
	return data['gerritQuery'] || DEFAULT_GERRIT_QUERY;
}