#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor-Swift.h>

CAP_PLUGIN(PencilEnhancedPlugin, "PencilEnhanced",
           CAP_PLUGIN_METHOD(isAvailable, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(startHandwritingSession, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(cancelHandwritingSession, CAPPluginReturnPromise);
           CAP_PLUGIN_METHOD(recognizeInkImage, CAPPluginReturnPromise);
)
