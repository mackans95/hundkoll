package se.hundkoll.app;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The live walk while it is on the lock screen (plan 20): native holds the
 * counts, so a tap with the app killed still lands. SharedPreferences, so it
 * survives the process. The page mirrors it, see activeWalk.svelte.ts.
 */
final class LiveWalkStore {

    private static final String PREFS = "live_walk";
    private static final String WALK = "walk";
    private static final String OUTBOX = "outbox";
    private static final String SAVED = "saved_id";

    private final SharedPreferences prefs;

    LiveWalkStore(Context context) {
        prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /**
     * The walk as the page sent it: id, label, icon, startedAt (ms), pee, poop,
     * the fixed form fields (type_id, detailed, event_id, occurred_at, note),
     * the origin to post to, and the notification's words (locale.ts owns them).
     */
    synchronized JSONObject walk() {
        String raw = prefs.getString(WALK, null);
        if (raw == null) return null;
        try {
            return new JSONObject(raw);
        } catch (JSONException e) {
            return null;
        }
    }

    synchronized void setWalk(JSONObject walk) {
        prefs.edit().putString(WALK, walk.toString()).apply();
    }

    synchronized void clearWalk() {
        prefs.edit().remove(WALK).apply();
    }

    /** One more pee or poop; returns the walk as it now stands. */
    synchronized JSONObject increment(String key) {
        JSONObject walk = walk();
        if (walk == null) return null;
        try {
            walk.put(key, walk.optInt(key, 0) + 1);
        } catch (JSONException e) {
            return walk;
        }
        setWalk(walk);
        return walk;
    }

    /** The id of the last walk Spara stored, so the page can drop its copy. */
    synchronized String savedId() {
        return prefs.getString(SAVED, null);
    }

    synchronized void markSaved(String id) {
        prefs.edit().putString(SAVED, id).apply();
    }

    /** Finished walks Spara could not send, as { fields, label, icon } for the page's queue. */
    synchronized void addToOutbox(JSONObject fields) {
        JSONArray outbox = outbox();
        outbox.put(fields);
        prefs.edit().putString(OUTBOX, outbox.toString()).apply();
    }

    synchronized JSONArray takeOutbox() {
        JSONArray outbox = outbox();
        prefs.edit().remove(OUTBOX).apply();
        return outbox;
    }

    private JSONArray outbox() {
        try {
            return new JSONArray(prefs.getString(OUTBOX, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }
}
