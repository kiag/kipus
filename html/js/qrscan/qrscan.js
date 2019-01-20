navigator.getUserMedia = navigator.getUserMedia || navigator.webkitGetUserMedia
	|| navigator.mozGetUserMedia || navigator.msGetUserMedia
	|| navigator.oGetUserMedia;

var QRReader = {};
QRReader.active = false;
QRReader.webcam = null;
QRReader.canvas = null;
QRReader.ctx = null;
QRReader.decoder = null;

var timer;


function
play(ev) {
  if (!ev.streaming) {
    QRReader.canvas.width = 600;
    QRReader.canvas.height = Math.ceil(600 / QRReader.webcam.clientWidth *
      QRReader.webcam.clientHeight);
    ev.streaming = true;
  }
}

/**
 * QRReader Initialization
 * Call this as soon as the document has finished loading.
 *
 * webcam_selector: selector for the webcam video tag
 * baseurl: path to QRScanJS from the working directory of your JavaScript
 */
QRReader.init = function (webcam, baseurl) {
	baseurl = typeof baseurl !== "undefined" ? baseurl : "";
	// Init Webcam + Canvas
	QRReader.webcam = webcam;
	QRReader.canvas = document.createElement("canvas");
	QRReader.ctx = QRReader.canvas.getContext("2d");
	QRReader.decoder = new Worker(baseurl + "decoder.min.js");

	// Resize webcam according to input
	QRReader.webcam.addEventListener("play", play, false);
}

/**
 * QRReader Scan Action
 * Call this to start scanning for QR codes.
 *
 * callback: A function(scan_result)
 */
QRReader.scan = function (callback) {
	QRReader.active = true
	function onDecoderMessage(e) {
		if (e.data.length > 0) {
			var qrid = e.data[0][2];
			QRReader.active = false
			callback(qrid);
		} else {
			timer = setTimeout(newDecoderFrame, 0);
		}
	}
	QRReader.decoder.onmessage = onDecoderMessage;

	// Start QR-decoder
	function newDecoderFrame() {
		if (!QRReader.active) return;
		try {
			QRReader.ctx.drawImage(QRReader.webcam, 0, 0,
				QRReader.canvas.width, QRReader.canvas.height);
			var imgData = QRReader.ctx.getImageData(0, 0, QRReader.canvas.width,
				QRReader.canvas.height);

			if (imgData.data) {
				QRReader.decoder.postMessage(imgData);
			}
		} catch(e) {
			// Try-Catch to circumvent Firefox Bug #879717
			if (e.name == "NS_ERROR_NOT_AVAILABLE") 
        timer = setTimeout(newDecoderFrame, 0);
		}
	}
	newDecoderFrame();
}

QRReader.destroy = function (callback) {
  log("destroy");
  clearTimeout(timer);
	QRReader.webcam.removeEventListener("play", play);
  QRReader.active = false;
  QRReader.webcam = null;
  QRReader.canvas = null;
  QRReader.ctx = null;
  QRReader.decoder = null;
  if (callback)
    callback();
}
