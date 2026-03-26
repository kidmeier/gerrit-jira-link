(function(){

	/* Scoped Variables */

	let localChanges = [];

	let localHostName = '';

	let localGerritQuery = '';

	let mostRecentUrl = '';

	let mostRecentJiraKey = '';

	let mostRecentGerritResponse = null;


	/* Listen for URL Changes */

	setInterval(() => {
		if (mostRecentUrl != window.location.href){
			mostRecentUrl = window.location.href;
			clearLocalChanges();
			toggleOffNativePopup();
			fetchChangesIfJiraKeyDetected();
			clearLastGerritResponse();
		}
	}, 500);


	/* Listen for Clicks */

	document.addEventListener('click', event => {
		const popup = document.getElementById('gerrit-jira-popup');

		if (popup){
			/* Clicking X, Clicking Outside Popup*/
			if (!popup.contains(event.target)
				|| event.target.classList.contains('gerrit-jira-close-button')
				|| event.target.classList.contains('gerrit-jira-close-button-img')
			)
			{
				toggleOffNativePopup();
			}
			/* Clicking Settings Wheel */
			else if (
				event.target.classList.contains('gerrit-jira-settings-button')
				|| event.target.classList.contains('gerrit-jira-settings-button-img')
			)
			{
				toggleOffNativePopup();
				toggleNativePopup('settings');
			}
			/* Clicking Save */
			else if (
				event.target.classList.contains('gerrit-jira-settings-submit-button')
			)
			{
				const hostname = document.getElementById('gerrit-jira-gerrit-host-input').value;
				const query = document.getElementById('gerrit-jira-gerrit-query-input').value;
				setGerritHost(hostname);
				setGerritQuery(query);
				toggleOffNativePopup();
			}
		}
	});


	/* Listen For Messages */

	chrome.runtime.onMessage.addListener( message => {
		switch (message['type']){
			case 'toggleNativePopup':
				storeLocalHostName(message.host);
				fetchLocalGerritQuery();
				toggleNativePopupBasedOnLocalState();
				break;
			case 'setLastGerritResponse':
				storeLastGerritResponse(message.status);
				break;
			case 'activeTabChange':
				toggleOffNativePopup();
				fetchChangesIfJiraKeyDetected();
				break;
			case 'purgeLocalChanges':
				clearLocalChanges(false);
				break;
		}
	});


	/* Fetch Gerrit Changes */

	function fetchChangesIfJiraKeyDetected(){
		const currentUrl = window.location.href;
		const selectedPattern = /(?<=browse\/)[A-Z]*-[0-9]*/;
		const browsePattern = /(?<=selectedIssue=)[A-Z]*-[0-9]*/;
		const jiraKey = currentUrl.match(selectedPattern) || currentUrl.match(browsePattern);
	
		if (jiraKey){
			mostRecentJiraKey = jiraKey;

			chrome.runtime.sendMessage({
				type: 'tryGetChangesByJiraKey',
				jiraKey: jiraKey
			}, storeLocalChanges);
		}
	}


	/* Local Changes */

	function storeLocalHostName(hostName){
		localHostName = hostName;
	}

	function fetchLocalGerritQuery(){
		chrome.runtime.sendMessage({
			type: 'getGerritQuery'
		}, query => {
			localGerritQuery = query;
		});
	}

	function storeLocalChanges(fetchedChanges){
		localChanges = fetchedChanges;
		setBadgeToLength(localChanges.length);
	}

	function clearLocalChanges(clearBadge = true){
		localChanges = [];
		if (clearBadge){ setBadgeToLength(0); }
	}

	function storeLastGerritResponse(status){
		mostRecentGerritResponse = status;
	}

	function clearLastGerritResponse(){
		mostRecentGerritResponse = null;
	}

	/* Set Gerrit Host */

	function setGerritHost(hostname){
		chrome.runtime.sendMessage({
			type: 'setGerritHost',
			host: hostname
		}, fetchChangesIfJiraKeyDetected);
	}

	function setGerritQuery(query){
		chrome.runtime.sendMessage({
			type: 'setGerritQuery',
			query: query
		});
	}


	/* Set Badge */

	function setBadgeToLength(length){
		chrome.runtime.sendMessage({
			type: 'setListBadge',
			value: length
		});
	}
	

	/* Toggle Native Popup */

	function toggleNativePopupBasedOnLocalState(){
		if (!localHostName) {
			toggleNativePopup('settings');
		}else if (localChanges?.length > 0){
			toggleNativePopup('list');
		}else if (mostRecentGerritResponse !== null){
			toggleNativePopup('debug');
		}else{
			toggleNativePopup('ticketless');
		}
	}

	function toggleNativePopup(type){
		const popup = document.getElementById('gerrit-jira-popup');

		if (popup){
			popup.remove();
		}else{
			renderNativePopup(type);
		}
	}

	function toggleOffNativePopup(){
		const popup = document.getElementById('gerrit-jira-popup');
		if (popup) { popup.remove(); }
	}


	/* Render Change List Popup */

	function renderNativePopup(type){
		const div = document.createElement('div');

		div.id = 'gerrit-jira-popup';

		div.innerHTML = type === 'list' 
			? getChangeListPopupContent()
			: type === 'settings'
			? getSettingsPopupContent()
			: type === 'debug'
			? getDebugPopupContent()
			: getTicketlessPopupContent();

		document.body.appendChild(div);
	}


	function getChangeListPopupContent(){
		const iconUrl = chrome.runtime.getURL('media/gerrit16.png');
		const gearUrl = chrome.runtime.getURL('media/gear48.png');
		const xUrl = chrome.runtime.getURL('media/close48.png');

		let html = `
			<div class="gerrit-jira-popup-content">
				<div class="gerrit-jira-title">
					<b>Gerrit Changes Linked to ${mostRecentJiraKey}</b>
				</div>
				<div class="gerrit-jira-close-button">
					<img class="gerrit-jira-close-button-img" src="${xUrl}" />
				</div>
				<div class="gerrit-jira-settings-button">
					<img class="gerrit-jira-settings-button-img" src="${gearUrl}" />
				</div>
				<table>
		`;

		localChanges.forEach(change => {
			html += `
					<tr>
					<td class="gerrit-jira-gerrit-icon">
							<img src="${iconUrl}" />
						</td>
						<td>
							<b>
								<a 
									class="gerrit-jira-change-link"
									target="_blank"
									href="https://${localHostName}/#/c/${change._number}/"
								>
									<b>${change.subject}</b>
								</a>
							</b>
						</td>
						<td class="gerrit-jira-change-repo">
							<b>(${change.project})</b>
						</td>
						<td class="gerrit-jira-change-status">
							<b>${change.status}</b>
						</td>
						<td class="gerrit-jira-change-insertions">
							<b>+${change.insertions}</b>
						</td>
						<td class="gerrit-jira-change-deletions">
							<b>-${change.deletions}</b>
						</td>
					</tr>
			`
		});

		html += `
				</table>
			</div>
		`;

		return html;
	}

	function getDebugPopupContent(){
		const gearUrl = chrome.runtime.getURL('media/gear48.png');
		const debugUrl = chrome.runtime.getURL('media/debug48.png');
		const xUrl = chrome.runtime.getURL('media/close48.png');
		const redUrl = chrome.runtime.getURL('media/red48.png');
		const greenUrl = chrome.runtime.getURL('media/green48.png');

		const hint = getHintByStatus(mostRecentGerritResponse);
		const statusMessage = getStatusMessageByStatus(mostRecentGerritResponse);

		return html = `
			<div class="gerrit-jira-popup-content">
				<div class="gerrit-jira-title">
					<img class="gerrit-jira-debug-icon-img" src="${debugUrl}" />
					<b>Last Response from ${localHostName ?? 'Gerrit'}: </b>
				</div>
				<div class="gerrit-jira-recent-status">
					<img class="gerrit-jira-status-icon-img" src="${mostRecentGerritResponse === 200 ? greenUrl : redUrl}" />	
					<b>${mostRecentGerritResponse === 0 ? 'Connection Failed' : mostRecentGerritResponse}${!!statusMessage ? `: ${statusMessage}` : ''}</b>
					<span class="gerrit-jira-status-hint">${hint}</span>
				</div>
				<div class="gerrit-jira-close-button">
					<img class="gerrit-jira-close-button-img" src="${xUrl}" />
				</div>
				<div class="gerrit-jira-settings-button">
					<img class="gerrit-jira-settings-button-img" src="${gearUrl}" />
				</div>
		`;
	}

	function getSettingsPopupContent(){
		const iconUrl = chrome.runtime.getURL('media/gerrit16.png');
		const gearUrl = chrome.runtime.getURL('media/gear48.png');
		const xUrl = chrome.runtime.getURL('media/close48.png');

		return html = `
			<div class="gerrit-jira-popup-content">
				<div class="gerrit-jira-title">
					<img class="gerrit-jira-settings-title-icon" src="${gearUrl}" />
					<b class="gerrit-jira-settings-title-text">Settings</b>
				</div>
				<div class="gerrit-jira-close-button">
					<img class="gerrit-jira-close-button-img" src="${xUrl}" />
				</div>

				<div class="gerrit-jira-settings-panel">
					<img class="gerrit-jira-gerrit-icon" src="${iconUrl}" />
					<b class="gerrit-jira-gerrit-host-label">Gerrit Host:</b>
					<input id="gerrit-jira-gerrit-host-input" type="text" value="${localHostName ?? ''}" placeholder="your.gerrit.host"/>
				</div>
				<div class="gerrit-jira-settings-panel">
					<img class="gerrit-jira-gerrit-icon" src="${iconUrl}" />
					<b class="gerrit-jira-gerrit-host-label">Gerrit Query:</b>
					<input id="gerrit-jira-gerrit-query-input" type="text" value="${localGerritQuery ?? ''}" placeholder="tr:${'$'}{jiraKey}"/>
					<button class="gerrit-jira-settings-submit-button">Save</button>
				</div>
			</div>
		`;
	}

	function getTicketlessPopupContent(){
		const searchUrl = chrome.runtime.getURL('media/search48.png');
		const gearUrl = chrome.runtime.getURL('media/gear48.png');
		const xUrl = chrome.runtime.getURL('media/close48.png');

		return html = `
			<div class="gerrit-jira-popup-content">
				<div class="gerrit-jira-title">
					<img class="gerrit-jira-debug-icon-img" src="${searchUrl}" />
					<b>No JIRA Ticket detected in URL.</b>
				</div>
				<div class="gerrit-jira-close-button">
					<img class="gerrit-jira-close-button-img" src="${xUrl}" />
				</div>
				<div class="gerrit-jira-settings-button">
					<img class="gerrit-jira-settings-button-img" src="${gearUrl}" />
				</div>
		`;
	}

	function getStatusMessageByStatus(status){
		switch (status) {
			case 200:
				return 'OK';
			case 401:
				return 'Unauthorized';
			case 403:
				return 'Forbidden';
			case 500:
				return 'Internal Server Error';
			default:
				return null;
		}
	}

	function getHintByStatus(status){
		switch (status) {
			case 200:
				return 'No Results Found.';
			case 401:
				return 'You may need to log in to Gerrit.';
			case 403:
				return 'You may need to log in to Gerrit.';
			case 0:
				return 'Gerrit was not reachable at the specified host.'
			default:
				return '';
		}
	}
})();