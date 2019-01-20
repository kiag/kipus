// Copyright 2016 Google Inc.
// 
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
// 
//      http://www.apache.org/licenses/LICENSE-2.0
// 
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
var projectName = "";   // will be set by offlineHandler
var isOffline;
var pn = location.pathname.split("/");
var cacheName = 'kipusClient.'+ (pn.length > 3 ? pn[1]: location.host) +"."+projectName; // location.host is special treatment for project hosted external
var updateCacheName = 'update'+cacheName;
var cacheModified = ''; // will be set by offlineHandler
var filesToCache = [    // will be set by offlineHandler
];
var downloadCount = {};

function
log(...args)
{
  var d = new Date();
  var ms = ("000"+(d.getMilliseconds()%1000));
  ms = ms.substr(ms.length-3,3);
  var prefix = d.toTimeString().substring(0,8)+"."+ms+" [Service Worker] ";
  // add prefix as first to arguments
  console.log(prefix+args.join(" "));
}

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(cacheName).then(function(cache) {
      log('Caching app shell');
      var p = location.pathname.split("/");
      p.pop();
      var url = p.join("/")+"/";
      self.clients.matchAll({includeUncontrolled: true, type: 'window'}).then(function (clients){
        downloadCount = {};
        var cl = [];
        for (var i=0; i<clients.length; i++) {
          // only message clients matching url
          if (clients[i].url.match(url)) {
            cl.push(clients[i]);
            downloadCount[clients[i].id] = 0;
          }
        }
        for (var i=0; i<filesToCache.length; i++) {
          addCacheAndMessageClients(cl, cache, filesToCache[i], filesToCache.length);
        }
      });
    }).then(function() {
      log('skipWaiting');
      // `skipWaiting()` forces the waiting ServiceWorker to become the
      // active ServiceWorker, triggering the `onactivate` event.
      // Together with `Clients.claim()` this allows a worker to take effect
      // immediately in the client(s).
      return self.skipWaiting();
    })
  );
});

function addCacheAndMessageClients(clients, cache, file, max)
{
  cache.add(file).then(function() {
    // Send a message to the client.
    clients.forEach(function(client){
      var msg = "Downloading files:<br>"+(++downloadCount[client.id])+" of "+max;
      client.postMessage({
        msg: msg,
        url: file,
        fn:  (downloadCount[client.id] == max?"onDownloadFinished":"onDownloading")
      });
    });
  });
}

self.addEventListener('activate', function(e) {
  log('Activate');
  e.waitUntil(
    // `claim()` sets this worker as the active worker for all clients that
    // match the workers scope and triggers an `oncontrollerchange` event for
    // the clients.
    self.clients.claim()
    .then(caches.keys()
          .then(function(keyList) {
            /*self.clients.matchAll({includeUncontrolled: false, type: 'window'}).then(function (clients){
              // strangely, list of controlled clients is empty, is this a bug?
              console.log(clients);
            });*/
            return Promise.all(keyList.map(function(key) {
              if (key.indexOf("kipusClient") == -1 && key.indexOf("updateKipusClient") == -1) {
                log('Removing unknown caches', key);
                return caches.delete(key);
              }
            }));
          })
    )
  );
});


self.addEventListener('fetch', function(event) {
  // don't interfere with POST method
  if (event.request.method == 'POST')
    return;
  if (event.request.cache == "no-store" && isOffline != "NO") {
      log("no-store");
      // update cache using cache=no-store (bit of a hack)
      // fetch file and write in update Cache
      var fetchRequest = event.request.clone();

      return fetch(fetchRequest).then(
        function(response) {
          // Check if we received a valid response
          if(!response || response.status !== 200 || response.type !== 'basic') {
            console.log(response);
            log('Fetch Failed', event.request.url);
            return response;
          }
          log('Fetch success for updateInProgress', event.request.url);

          // IMPORTANT: Clone the response. A response is a stream
          // and because we want the browser to consume the response
          // as well as the cache consuming the response, we need
          // to clone it so we have two streams.
          var responseToCache = response.clone();

          caches.open(updateCacheName)
            .then(function(cache) {
              if (event.request.method != "POST") {
                log("add request to "+updateCacheName+" cache: " +event.request.url);
                cache.put(event.request, responseToCache);
                return response;
              }
            }); 

          //return response;
        }
      ).catch(function(err) {
          log('Fetch Error', event.request.url + " cache="+event.request.cache + ": " + err);
      });
  }
  // "Cache falling back to network" offline strategy:
  // https://jakearchibald.com/2014/offline-cookbook/#cache-falling-back-to-network 
  event.respondWith(
    caches.match(event.request).then(function(response) {
      if (response && isOffline != "NO") {
        log('Loading from cache storage', event.request.url);
        return response;
      }
      return fetch(event.request).then(function(response) {

            if(!response || response.status !== 200 || response.type !== 'basic') {
              log('Fetch Failed', event.request.url);
              return response;
            }
            log('Fetch Success', event.request.url + " cache="+event.request.cache);
            return response;
          }
        ).catch(function(err) {
          log('Fetch Error', event.request.url + " cache="+event.request.cache + ": " + err);
        });
    })
  );
});

self.addEventListener('push', function (event) {
  log('push event');
  var o = {};
  if (event.data)
    o = event.data.json();
  var notificationTitle = o.data.title || 'Hello';
  var notificationOptions = {
    body: o.data.message || 'Thanks for sending this push msg.',
    icon: 'css/images/touch_icon_152.png',
    badge: 'css/images/icon_96.png'
  };
  event.waitUntil(Promise.all([self.registration.showNotification(notificationTitle, notificationOptions)]));
});

/*self.addEventListener('message', function(event){
  log('message event');
  var fn = typeof event.data == "object" ? event.data.fn : "notification";
  if (fn == "notification") {
    var data = typeof event.data == "object" ? event.data: { title: event.data };
    if (!data.body)
       data.body = "New version of this site found. Click to download new version!";
    if (!data.icon)
       data.icon = './projects/GTVP/logo.png';
    event.waitUntil(
      self.registration.showNotification(data.title, {
        body: data.body,
        icon: data.icon,
        badge: data.badge,
        url: data.url
      })
    );
  }
});*/

self.addEventListener('notificationclick', function(event) {
  log('notificationclick event');
  // Android doesn’t close the notification when you click on it
  // See: http://crbug.com/463146

  //console.log(event.notification);
  //let path = event.notification.data.url;
  let path = self.registration.scope;
  //event.notification.close();
  // This looks to see if the current is already open and
  // focuses if it is
  event.waitUntil(clients.matchAll({
    type: 'window'
  }).then(function(clientList) {
    for (var i = 0; i < clientList.length; i++) {
      var client = clientList[i];
      if (client.url.indexOf(path) == 0 && 'focus' in client)
        return client.focus();
    }
    if (clients.openWindow)
      return clients.openWindow(path);
  }));

});

