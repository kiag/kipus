var messaging;
if (typeof firebase != 'undefined')
  messaging = firebase.messaging();


let userToken    = null,
    isSubscribed = false,
    pushBtn = null;

window.addEventListener('load', () => {

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register(projectName+'.service-worker.js')
            .then(registration => {
                messaging.useServiceWorker(registration);
                //initializePush();
            })
            .catch(err => console.log('Service Worker Error', err));

    } else {
        if (pushBtn)
          pushBtn.innerHTML = tr.pushNotSupported?tr.pushNotSupported:'Push not supported.';
    }

});

function initializePush() {
    if (document.getElementsByClassName('push-button').length)
      pushBtn   = document.getElementsByClassName('push-button')[0];
    userToken = userData.pushToken;
    isSubscribed = typeof userToken == "string";
    updateBtn();
}

function updateBtn() {
    if (!pushBtn)
      return; 
    log("updateBtn " + isSubscribed);
    if (Notification.permission === 'denied') {
        pushBtn.innerHTML = tr.pushBlocked?tr.pushBlocked:'Subscription blocked';
        return;
    }
    var btnTxt = isSubscribed ? tr.pushUnsubscribe:tr.pushSubscribe;
    if (navigator.connection.type == "none")
      btnTxt += " ("+(tr.networkNeeded?tr.networkNeeded:"needs internet connection")+")";
    pushBtn.innerHTML = btnTxt;
    pushBtn.disabled = false;
}

function subscribeUser(callbackfn) {
    log("subscribeUser called");
    if (pushBtn)
      pushBtn.disabled = true;
    log("request messaging.permission");
    messaging.requestPermission()
        .then(() => messaging.getToken())
        .then(token => {
            log("token received from FCM");
            updateSubscriptionOnServer(token, function (res) {
              log("token sent to server");
              isSubscribed = true;
              userData.pushToken = userToken = token;
              db_updateAnswer(0,"userPref",0, userData, function() {
                updateBtn();
                if (callbackfn)
                  callbackfn();
              });
            });
        })
        //.catch(err => console.log('Denied', err));
        .catch(function(err) {
           console.log('Error unsubscribing', err);
           okDialog(err.message);
           if (pushBtn)
             pushBtn.disabled = false;
           if (callbackfn)
             callbackfn();
        });

}

function unsubscribeUser(callbackfn, ignoreErrors) {
    log("unsubscribeUser called");
    if (pushBtn)
      pushBtn.disabled = true;
    messaging.deleteToken(userToken)
        .then(() => {
            updateSubscriptionOnServer(userToken, function(res) {
              isSubscribed = false;
              userToken = null;
              delete userData.pushToken;
              db_updateAnswer(0,"userPref",0, userData, function() {
                if (callbackfn)
                  callbackfn();
                else
                  updateBtn();
              });
            });
        })
        //.catch(err => console.log('Error unsubscribing', err));
        .catch(function(err) {
           console.log('Error unsubscribing', err);
           if (pushBtn)
             pushBtn.disabled = false;
           if (ignoreErrors) {
              // e.g. ignore unsubcribe when reinstall the app
              if (callbackfn)
                callbackfn();
           }
           else
             okDialog(err.message);
        });
}

function updateSubscriptionOnServer(token, callbackfn) {
    // remove token
    log("updateSubscriptionOnServer called, removeToken="+isSubscribed);
    var ptData = { token: token, removeToken: isSubscribed, platform: platform };
    backendCall("updatePushToken", ptData, function(res) {
      if (callbackfn)
        callbackfn(); 
    }, undefined, function(err) {
      okDialog("update subscription token failed:<br>"+err);
    });
}
