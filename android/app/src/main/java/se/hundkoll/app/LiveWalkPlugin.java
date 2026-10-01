package se.hundkoll.app;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONObject;

/** The page's side of the lock-screen walk, see $lib/native.ts. */
@CapacitorPlugin(name = "LiveWalk")
public class LiveWalkPlugin extends Plugin {

    // The receiver runs without the bridge; this is how it reaches a page that is up.
    private static volatile LiveWalkPlugin current;

    @Override
    public void load() {
        current = this;
    }

    /** Starts or replaces the walk on the lock screen. */
    @PluginMethod
    public void show(PluginCall call) {
        LiveWalkStore store = new LiveWalkStore(getContext());
        JSONObject walk = call.getData();
        store.setWalk(walk);
        LiveWalkNotification.show(getContext(), walk);
        call.resolve();
    }

    @PluginMethod
    public void hide(PluginCall call) {
        new LiveWalkStore(getContext()).clearWalk();
        LiveWalkNotification.hide(getContext());
        call.resolve();
    }

    /** The walk native holds (counts may be ahead of the page), and the last one Spara stored. */
    @PluginMethod
    public void state(PluginCall call) {
        LiveWalkStore store = new LiveWalkStore(getContext());
        JSObject result = new JSObject();
        JSONObject walk = store.walk();
        if (walk != null) {
            result.put("id", walk.optString("id"));
            result.put("pee", walk.optInt("pee"));
            result.put("poop", walk.optInt("poop"));
        }
        result.put("savedId", store.savedId());
        call.resolve(result);
    }

    /** Walks Spara could not send, as form fields; handed over once. */
    @PluginMethod
    public void takeOutbox(PluginCall call) {
        JSObject result = new JSObject();
        try {
            JSArray items = new JSArray(new LiveWalkStore(getContext()).takeOutbox().toString());
            if (items.length() > 0) LiveWalkNotification.hidePending(getContext());
            result.put("items", items);
        } catch (Exception e) {
            result.put("items", new JSArray());
        }
        call.resolve(result);
    }

    static void emitChanged(JSONObject walk) {
        LiveWalkPlugin plugin = current;
        if (plugin == null) return;
        JSObject data = new JSObject();
        data.put("id", walk.optString("id"));
        data.put("pee", walk.optInt("pee"));
        data.put("poop", walk.optInt("poop"));
        plugin.notifyListeners("walkChanged", data);
    }

    static void emitSaved(String id) {
        LiveWalkPlugin plugin = current;
        if (plugin == null) return;
        JSObject data = new JSObject();
        data.put("savedId", id);
        plugin.notifyListeners("walkSaved", data);
    }
}
