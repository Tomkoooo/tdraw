package com.tdraw.plugins.pencilehanced

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "PencilEnhanced")
class PencilEnhancedPlugin : Plugin() {

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val features = JSObject()
        features.put("doubleTap", false)
        features.put("handwritingModal", false)
        features.put("squeeze", false)
        val o = JSObject()
        o.put("available", false)
        o.put("platform", "android")
        o.put("features", features)
        call.resolve(o)
    }

    @PluginMethod
    fun startHandwritingSession(call: PluginCall) {
        val o = JSObject()
        o.put("text", "")
        call.resolve(o)
    }

    @PluginMethod
    fun cancelHandwritingSession(call: PluginCall) {
        call.resolve()
    }

    @PluginMethod
    fun recognizeInkImage(call: PluginCall) {
        val o = JSObject()
        o.put("text", "")
        call.resolve(o)
    }
}
