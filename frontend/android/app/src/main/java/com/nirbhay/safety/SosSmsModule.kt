package com.nirbhay.safety

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.nirbhay.safety.sos.comm.SmsSender

class SosSmsModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "SosSmsModule"

  @ReactMethod
  fun sendSms(recipients: ReadableArray, message: String, promise: Promise) {
    val context = reactApplicationContext

    if (!SmsSender.hasSendSmsPermission(context)) {
      promise.reject("PERMISSION_DENIED", "SEND_SMS permission is not granted")
      return
    }

    val phoneNumbers = (0 until recipients.size()).mapNotNull { recipients.getString(it) }
    val sendResult = SmsSender.send(context, phoneNumbers, message)

    val sent = Arguments.createArray().apply { sendResult.sent.forEach { pushString(it) } }
    val failed = Arguments.createArray().apply { sendResult.failed.forEach { pushString(it) } }

    val result = Arguments.createMap()
    result.putArray("sent", sent)
    result.putArray("failed", failed)
    promise.resolve(result)
  }
}
