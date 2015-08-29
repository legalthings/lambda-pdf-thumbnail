function PdfThumbnailError(message, errorcode) {
  'use strict';
  Error.captureStackTrace(this, this.constructor);
  this.name = this.constructor.name;
  this.message = message;
  this.errorcode = errorcode;
}

PdfThumbnailError.SAME_DST_SRC_BUCKET = 0;
PdfThumbnailError.UNKNOWN_FILE_TYPE = 1;
PdfThumbnailError.WRONG_FILE_TYPE = 2;

module.exports = PdfThumbnailError;
