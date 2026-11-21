const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = name => fs.readFileSync(path.join(__dirname, '../teams-captions-saver', name), 'utf8');

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((onResolve, onReject) => {
        resolve = onResolve;
        reject = onReject;
    });
    return {promise, resolve, reject};
}

async function waitFor(predicate, message) {
    for (let index = 0; index < 40; index++) {
        if (predicate()) return;
        // Drain the complete promise chain; a fixed microtask count makes a
        // scheduling assertion depend on the number of harmless awaits.
        await new Promise(resolve => setImmediate(resolve));
    }
    assert.fail(message);
}

function permissionFlow({
    age = 120001,
    granted = true,
    alreadyGranted = false,
    connectMode = 'resolved',
    advanceAfterWorkerStart = 0,
    permissionCheckAdvance = 0,
    explicitConnectBeforePermissionReturns = false,
    settleBeforePermissionReturns = false,
    delayPolicy = false,
    cancelRejects = true,
    permissionLookupGate = false,
    intentWriteGate = false
} = {}) {
    const popup = read('popup.js');
    const worker = read('service_worker.js');
    let now = 1000000;
    let hasAccess = alreadyGranted;
    let workerConnects = 0;
    let permissionRequests = 0;
    let connected = false;
    const session = {};
    const messages = [];
    const resumeOutcomes = [];
    const connection = deferred();
    const policyRead = deferred();
    const lookupRelease = deferred();
    const intentRelease = deferred();
    let lookupPending = false;
    let intentPending = false;
    let readingPolicy = false;
    let explicitConnection;
    const area = {
        async get(key) { return {[key]:session[key]}; },
        async set(values) {
            if (intentWriteGate && values.graphConnectPending && !values.graphConnectPending.state) {
                intentWriteGate = false;
                intentPending = true;
                await intentRelease.promise;
            }
            Object.assign(session, values);
        },
        async remove(key) { delete session[key]; }
    };
    const permissions = {async contains() {
        if (permissionLookupGate) {
            permissionLookupGate = false;
            lookupPending = true;
            await lookupRelease.promise;
        }
        if (hasAccess && permissionCheckAdvance) {
            now += permissionCheckAdvance;
            permissionCheckAdvance = 0;
        }
        return hasAccess;
    }};
    const clock = {now:() => now};
    const workerContext = vm.createContext({
        chrome:{
            permissions,
            storage:{session:area, sync:{async get() { return {}; }}},
            runtime:{getManifest() { return {}; }}
        },
        CaptionKeepConfiguration:{
            async readGraphUserConfig() {
                readingPolicy = true;
                if (delayPolicy) await policyRead.promise;
                return {};
            },
            async readManaged() { return {}; },
            applyPolicy() { return {settings:{}}; },
            applyGraphRuntimeConfig(policy) { return policy; }
        },
        CaptionKeepGraphRuntimeConfig:{},
        CaptionKeepGraphTranscript:{
            async disconnect() {
                connected = false;
                const error = new Error('Microsoft sign-in was cancelled by Disconnect.');
                error.code = 'AUTH_CANCELLED';
                if (workerConnects > 0 && cancelRejects) connection.reject(error);
                return {connected:false};
            },
            async connect() {
                workerConnects++;
                if (connectMode === 'pending') {
                    await connection.promise;
                } else if (connectMode === 'failed') {
                    const error = new Error('Microsoft sign-in was cancelled.');
                    error.code = 'AUTH_CANCELLED';
                    throw error;
                }
                connected = true;
                return {connected:true};
            }
        },
        Date:clock,
        Number,
        console
    });
    const workerStart = worker.indexOf('const MICROSOFT_365_HOST_ACCESS');
    const workerEnd = worker.indexOf('chrome.permissions?.onAdded?.addListener');
    assert(workerStart >= 0 && workerEnd > workerStart, 'Actual worker connection coordinator must be present');
    vm.runInContext(worker.slice(workerStart, workerEnd), workerContext);
    const directConnectCase = worker.match(/case 'graph_connect':\s*\{([\s\S]*?)\}\s*break;/);
    assert(directConnectCase, 'Actual explicit Connect dispatch must be present');
    const dispatchConnect = () => vm.runInContext(`(async () => {
        let responsePayload;
        ${directConnectCase[1]}
        return responsePayload;
    })()`, workerContext);
    const disconnectCase = worker.match(/case 'graph_disconnect':([\s\S]*?)break;/);
    assert(disconnectCase, 'Actual Disconnect dispatch must be present');
    const dispatchDisconnect = () => vm.runInContext(`(async () => {
        let responsePayload;
        ${disconnectCase[1]}
        return responsePayload;
    })()`, workerContext);

    permissions.request = async () => {
        permissionRequests++;
        now += age;
        hasAccess = granted;
        if (granted) {
            await vm.runInContext('resumePendingMicrosoft365Connect()', workerContext);
            await waitFor(() => workerConnects > 0 || session.graphConnectPending?.state === 'expired',
                'Worker must decide whether to start or expire the pending intent');
            now += advanceAfterWorkerStart;
            if (explicitConnectBeforePermissionReturns) {
                // Another settings surface performs a fresh Connect after host
                // access arrives, before this permission promise returns.
                explicitConnection = dispatchConnect();
                if (settleBeforePermissionReturns) {
                    if (settleBeforePermissionReturns === 'failed') {
                        const error = new Error('Microsoft sign-in was cancelled.');
                        error.code = 'AUTH_CANCELLED';
                        connection.reject(error);
                    } else connection.resolve();
                    await explicitConnection.catch(() => undefined);
                }
            }
        }
        return granted;
    };

    const elements = {};
    for (const name of ['graphTranscriptSection', 'graphConnectButton', 'graphDisconnectButton', 'graphUseCurrentMeeting',
        'graphRefreshMeetings', 'graphRecentMeetings', 'graphImportButton', 'graphJoinUrl', 'graphConnectionStatus', 'graphRedirectUri']) {
        elements[name] = {
            hidden:false,
            disabled:false,
            value:'',
            textContent:'',
            querySelectorAll:() => [],
            addEventListener(_event, callback) { this.click = callback; }
        };
    }
    const context = vm.createContext({
        chrome:{permissions, storage:{session:area}},
        Date:clock,
        Number,
        UI_ELEMENTS:elements,
        currentEnterprisePolicy:{},
        clearTimeout,
        setTimeout,
        async sendGraphMessage(message) {
            messages.push(message.message);
            if (message.message === 'graph_resume_connect') {
                const outcome = await vm.runInContext('resumePendingMicrosoft365Connect({waitForCompletion:true})', workerContext);
                resumeOutcomes.push(outcome.outcome);
                return outcome;
            }
            if (message.message === 'graph_connect') {
                return await dispatchConnect();
            }
            if (message.message === 'graph_disconnect') return await dispatchDisconnect();
            if (message.message === 'graph_get_status') return {connected, configured:true};
            throw new Error(`Unexpected message: ${message.message}`);
        },
        async refreshRecentGraphMeetings() {},
        renderRecentGraphMeetings() {},
        graphErrorMessage:error => error.code === 'AUTH_CANCELLED' ? 'Microsoft 365 sign-in was cancelled.' : error.message
    });
    const request = popup.slice(
        popup.indexOf('async function requestMicrosoft365HostAccess()'),
        popup.indexOf('// --- Utility Functions ---')
    );
    const controls = popup.slice(
        popup.indexOf('function refreshGraphControls()'),
        popup.indexOf('function graphErrorMessage(')
    );
    const status = popup.slice(
        popup.indexOf('async function refreshGraphStatus()'),
        popup.indexOf('async function populateCurrentTeamsMeeting(')
    );
    const identifierPresentation = popup.slice(
        popup.indexOf('const GRAPH_IDENTIFIER_MASK'),
        popup.indexOf('function updateGraphSetupControls(')
    );
    const click = popup.slice(
        popup.indexOf("UI_ELEMENTS.graphConnectButton?.addEventListener('click'"),
        popup.indexOf("UI_ELEMENTS.graphSaveSetup?.addEventListener('click'")
    );
    const disconnectClick = popup.slice(
        popup.indexOf("UI_ELEMENTS.graphDisconnectButton?.addEventListener('click'"),
        popup.indexOf("UI_ELEMENTS.graphImportButton?.addEventListener('click'")
    );
    assert(request && controls && status && click, 'Actual popup flow must be present');
    vm.runInContext(`
        const MICROSOFT_365_HOST_ACCESS=[];
        let graphBusy=false, graphConnected=false, graphConfigured=true;
        let graphConnecting=false, graphConnectionAttempt=0;
        let graphPermissionIntentWrites=Promise.resolve();
        ${request}\n${controls}\n${identifierPresentation}\n${status}\n${click}\n${disconnectClick}
    `, context);
    return {
        elements,
        session,
        messages,
        resumeOutcomes,
        click:() => elements.graphConnectButton.click(),
        resolveConnection:() => connection.resolve(),
        rejectConnection:error => connection.reject(error),
        resumeWithoutIntent:() => vm.runInContext('resumePendingMicrosoft365Connect({waitForCompletion:true})', workerContext),
        disconnect:dispatchDisconnect,
        cancelFromPopup:() => elements.graphDisconnectButton.click(),
        releasePolicy:() => policyRead.resolve(),
        get readingPolicy() { return readingPolicy; },
        get lookupPending() { return lookupPending; },
        get intentPending() { return intentPending; },
        releaseLookup:() => lookupRelease.resolve(),
        releaseIntent:() => intentRelease.resolve(),
        get explicitConnection() { return explicitConnection; },
        get workerConnects() { return workerConnects; },
        get permissionRequests() { return permissionRequests; }
    };
}

test('late unstarted permission approval expires in the worker and restores Connect for a fresh click', async () => {
    const flow = permissionFlow();
    await flow.click();
    assert.equal(flow.workerConnects, 0);
    assert.deepEqual(flow.messages, ['graph_resume_connect']);
    assert.equal(flow.session.graphConnectPending.state, 'expired');
    assert.equal(flow.elements.graphConnectButton.disabled, false);
    assert.match(flow.elements.graphConnectionStatus.textContent, /Access approved.*expired.*Click Connect Microsoft 365 again/);

    await flow.click();
    assert.equal(flow.permissionRequests, 1);
    assert.equal(flow.workerConnects, 1);
    assert.deepEqual(flow.messages, ['graph_resume_connect', 'graph_connect', 'graph_get_status']);
    assert.match(flow.elements.graphConnectionStatus.textContent, /^Connected/);
});

test('invalid or negative pending ages fail closed without starting OAuth', async () => {
    for (const age of [-1, NaN, Infinity]) {
        const flow = permissionFlow({age});
        await flow.click();
        assert.equal(flow.workerConnects, 0);
        assert.equal(flow.elements.graphConnectButton.disabled, false);
        assert.match(flow.elements.graphConnectionStatus.textContent, /expired/);
    }
});

test('timely approval through the exact two-minute boundary completes through the worker', async () => {
    for (const age of [0, 119999, 120000]) {
        const flow = permissionFlow({age});
        await flow.click();
        assert.equal(flow.workerConnects, 1);
        assert.equal(flow.session.graphConnectPending.state, 'completed');
        assert.deepEqual(flow.messages, ['graph_resume_connect', 'graph_get_status']);
        assert.match(flow.elements.graphConnectionStatus.textContent, /^Connected/);
    }
});

test('permission verification crossing beyond the exact boundary expires without OAuth', async () => {
    const flow = permissionFlow({age:120000, permissionCheckAdvance:2});
    await flow.click();
    assert.equal(flow.workerConnects, 0);
    assert.deepEqual(flow.resumeOutcomes, ['expired']);
    assert.equal(flow.session.graphConnectPending.state, 'expired');
    assert.equal(flow.elements.graphConnectButton.disabled, false);
    assert.match(flow.elements.graphConnectionStatus.textContent, /expired/);
});

test('worker failure is acknowledged and restores a usable Connect action', async () => {
    const flow = permissionFlow({age:10, connectMode:'failed'});
    await flow.click();
    assert.equal(flow.workerConnects, 1);
    assert.equal(flow.session.graphConnectPending.state, 'failed');
    assert.equal(flow.elements.graphConnectButton.disabled, false);
    assert.match(flow.elements.graphConnectionStatus.textContent, /cancelled/);
});

test('denied permission restores Connect and already-granted access uses the shared coordinator', async () => {
    const denied = permissionFlow({granted:false});
    await denied.click();
    assert.equal(denied.workerConnects, 0);
    assert.deepEqual(denied.messages, []);
    assert.equal(denied.elements.graphConnectButton.disabled, false);
    assert.equal(denied.session.graphConnectPending, undefined);

    const granted = permissionFlow({alreadyGranted:true});
    await granted.click();
    assert.equal(granted.permissionRequests, 0);
    assert.equal(granted.workerConnects, 1);
    assert.deepEqual(granted.messages, ['graph_connect', 'graph_get_status']);
});

test('worker-before-boundary and popup-after-boundary remain one pending OAuth flow', async () => {
    const flow = permissionFlow({age:119999, connectMode:'pending', advanceAfterWorkerStart:2});
    const firstClick = flow.click();
    await waitFor(() => flow.workerConnects === 1 && flow.messages.includes('graph_resume_connect'),
        'The worker must start OAuth before the popup resumes after the boundary');
    assert.equal(flow.elements.graphConnectButton.disabled, true);
    assert.match(flow.elements.graphConnectionStatus.textContent, /Opening Microsoft sign-in/);

    const forcedSecondClick = flow.click();
    await waitFor(() => flow.messages.includes('graph_connect'),
        'A forced second callback must reach the same worker-side coordinator');
    assert.equal(flow.workerConnects, 1, 'A second Connect path must join the pending OAuth operation');
    assert(flow.messages.includes('graph_connect'));

    flow.resolveConnection();
    await Promise.all([firstClick, forcedSecondClick]);
    assert.equal(flow.workerConnects, 1);
    assert.equal(flow.session.graphConnectPending.state, 'completed',
        'Joining Connect preserves the originating permission acknowledgment');
    assert.match(flow.elements.graphConnectionStatus.textContent, /^Connected/);
});

test('a fresh explicit Connect cannot make the original permission popup falsely expire an active OAuth', async () => {
    const flow = permissionFlow({age:119999, connectMode:'pending', advanceAfterWorkerStart:2,
        explicitConnectBeforePermissionReturns:true});
    const firstClick = flow.click();
    await waitFor(() => flow.workerConnects === 1 && flow.messages.includes('graph_resume_connect'),
        'The original popup must resume after another surface joins the worker OAuth');
    for (let index = 0; index < 40; index++) await Promise.resolve();
    assert.equal(flow.workerConnects, 1);
    assert.equal(flow.elements.graphConnectButton.disabled, true,
        'Missing intent must not be reported expired while the worker OAuth remains active');
    assert.match(flow.elements.graphConnectionStatus.textContent, /Opening Microsoft sign-in/);
    flow.resolveConnection();
    await Promise.all([firstClick, flow.explicitConnection]);
    assert.equal(flow.workerConnects, 1);
    assert.match(flow.elements.graphConnectionStatus.textContent, /^Connected/);
});

test('a consumed-intent join reports OAuth cancellation and permits a fresh user action', async () => {
    const flow = permissionFlow({age:119999, connectMode:'pending', advanceAfterWorkerStart:2,
        explicitConnectBeforePermissionReturns:true});
    const firstClick = flow.click();
    await waitFor(() => flow.explicitConnection && flow.messages.includes('graph_resume_connect'),
        'Both settings surfaces must join before the OAuth failure');
    const explicitOutcome = flow.explicitConnection.catch(error => error.code);
    const error = new Error('Microsoft sign-in was cancelled.');
    error.code = 'AUTH_CANCELLED';
    flow.rejectConnection(error);
    assert.equal(await explicitOutcome, 'AUTH_CANCELLED');
    await firstClick;
    assert.equal(flow.workerConnects, 1);
    assert.equal(flow.elements.graphConnectButton.disabled, false);
    assert.match(flow.elements.graphConnectionStatus.textContent, /cancelled/);
    assert.equal(flow.session.graphConnectPending.state, 'failed');
});

test('completed or failed joined OAuth remains acknowledged before the permission callback returns', async () => {
    for (const outcome of ['completed', 'failed']) {
        const flow = permissionFlow({age:119999, connectMode:'pending', advanceAfterWorkerStart:2,
            explicitConnectBeforePermissionReturns:true, settleBeforePermissionReturns:outcome});
        await flow.click();
        assert.equal(flow.workerConnects, 1);
        assert.deepEqual(flow.resumeOutcomes, [outcome]);
        assert.equal(flow.session.graphConnectPending.state, outcome);
        assert.equal(flow.elements.graphConnectButton.disabled, outcome === 'completed');
        assert.match(flow.elements.graphConnectionStatus.textContent, outcome === 'completed' ? /^Connected/ : /cancelled/);
    }
});

test('an absent permission intent without an active OAuth remains expired and never starts sign-in', async () => {
    const flow = permissionFlow();
    const outcome = await flow.resumeWithoutIntent();
    assert.equal(outcome.outcome, 'expired');
    assert.equal(flow.workerConnects, 0);
    assert.equal(flow.permissionRequests, 0);
});

test('actual Disconnect dispatch cancels active OAuth and retires its permission intent', async () => {
    const flow = permissionFlow({age:119999, connectMode:'pending', advanceAfterWorkerStart:2});
    const clicking = flow.click();
    await waitFor(() => flow.workerConnects === 1 && flow.messages.includes('graph_resume_connect'),
        'OAuth must be pending before Disconnect');
    assert.equal((await flow.disconnect()).connected, false);
    await clicking;
    assert.equal(flow.session.graphConnectPending, undefined);
    assert.equal((await flow.resumeWithoutIntent()).outcome, 'expired');
    assert.equal(flow.workerConnects, 1, 'Old permission callbacks must never restart cancelled OAuth');
    assert.equal(flow.elements.graphConnectButton.disabled, false);
    assert.match(flow.elements.graphConnectionStatus.textContent, /cancelled/);
});

test('Disconnect during policy lookup prevents the queued Connect from starting OAuth', async () => {
    const flow = permissionFlow({alreadyGranted:true, delayPolicy:true});
    const clicking = flow.click();
    await waitFor(() => flow.readingPolicy, 'Connect must be waiting on its real policy lookup');
    await flow.disconnect();
    flow.releasePolicy();
    await clicking;
    assert.equal(flow.workerConnects, 0);
    assert.equal(flow.elements.graphConnectButton.disabled, false);
    assert.match(flow.elements.graphConnectionStatus.textContent, /cancelled/);
    assert.equal((await flow.resumeWithoutIntent()).outcome, 'expired');
});

test('visible Cancel sign-in cancels pending OAuth and stale completion cannot overwrite its result', async () => {
    const flow = permissionFlow({age:119999, connectMode:'pending', advanceAfterWorkerStart:2});
    const clicking = flow.click();
    await waitFor(() => flow.workerConnects === 1 && flow.messages.includes('graph_resume_connect'),
        'Worker OAuth must be pending');
    assert.equal(flow.elements.graphDisconnectButton.disabled, false);
    assert.equal(flow.elements.graphDisconnectButton.textContent, 'Cancel sign-in');
    await flow.cancelFromPopup();
    await clicking;
    assert.match(flow.elements.graphConnectionStatus.textContent, /sign-in cancelled/);
    assert.equal(flow.elements.graphDisconnectButton.textContent, 'Disconnect');
    assert.equal(flow.elements.graphDisconnectButton.disabled, true);
    assert.equal(flow.elements.graphConnectButton.disabled, false);
    assert.equal(flow.session.graphConnectPending, undefined);
    assert.equal(flow.workerConnects, 1);
});

test('late successful Connect response cannot replace the popup cancellation state', async () => {
    const flow = permissionFlow({alreadyGranted:true, connectMode:'pending', cancelRejects:false});
    const clicking = flow.click();
    await waitFor(() => flow.workerConnects === 1, 'Explicit OAuth must be pending');
    assert.equal(flow.elements.graphDisconnectButton.disabled, false);
    await flow.cancelFromPopup();
    flow.resolveConnection();
    await clicking;
    assert.match(flow.elements.graphConnectionStatus.textContent, /sign-in cancelled/);
    assert.equal(flow.elements.graphConnectButton.disabled, false);
    assert.equal(flow.messages.includes('graph_get_status'), false,
        'A stale successful response must not refresh connected UI after Cancel');
});

test('Cancel during permission lookup cannot publish an intent or request permission afterwards', async () => {
    const flow = permissionFlow({age:0, permissionLookupGate:true});
    const clicking = flow.click();
    await waitFor(() => flow.lookupPending, 'Initial permissions.contains must be pending');
    await flow.cancelFromPopup();
    flow.releaseLookup();
    await clicking;
    assert.equal(flow.permissionRequests, 0);
    assert.equal(flow.workerConnects, 0);
    assert.equal(flow.session.graphConnectPending, undefined);
    assert.match(flow.elements.graphConnectionStatus.textContent, /sign-in cancelled/);
});

test('Cancel drains an in-flight intent publication before retiring it without requesting permission', async () => {
    const flow = permissionFlow({age:0, intentWriteGate:true});
    const clicking = flow.click();
    await waitFor(() => flow.intentPending, 'Intent session.set must be pending');
    let cancelled = false;
    const cancelling = flow.cancelFromPopup().then(() => { cancelled = true; });
    for (let index = 0; index < 10; index++) await Promise.resolve();
    assert.equal(cancelled, false, 'Cancel must not report completion before pending publication is retired');
    flow.releaseIntent();
    await Promise.all([clicking, cancelling]);
    assert.equal(flow.permissionRequests, 0);
    assert.equal(flow.workerConnects, 0);
    assert.equal(flow.session.graphConnectPending, undefined);
    assert.equal((await flow.resumeWithoutIntent()).outcome, 'expired');
    assert.match(flow.elements.graphConnectionStatus.textContent, /sign-in cancelled/);
});

test('permission recovery keeps the existing polite status region and native Connect button', () => {
    const html = read('popup.html');
    assert.match(html, /<p[^>]*id="graphConnectionStatus"[^>]*role="status"[^>]*aria-live="polite"/);
    assert.match(html, /<button[^>]*id="graphConnectButton"[^>]*type="button"/);
});
