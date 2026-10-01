package se.hundkoll.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.webkit.CookieManager;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import org.json.JSONObject;

/**
 * The notification's buttons. Broadcasts, so they run from the lock screen
 * without an unlock and with the app killed; only opening the app asks.
 */
public class LiveWalkReceiver extends BroadcastReceiver {

    static final String ADD_PEE = "se.hundkoll.app.live-walk.ADD_PEE";
    static final String ADD_POOP = "se.hundkoll.app.live-walk.ADD_POOP";
    static final String SAVE = "se.hundkoll.app.live-walk.SAVE";

    @Override
    public void onReceive(Context context, Intent intent) {
        LiveWalkStore store = new LiveWalkStore(context);
        String action = intent.getAction();

        if (ADD_PEE.equals(action) || ADD_POOP.equals(action)) {
            JSONObject walk = store.increment(ADD_PEE.equals(action) ? "pee" : "poop");
            if (walk != null) {
                LiveWalkNotification.show(context, walk);
                LiveWalkPlugin.emitChanged(walk);
            }
        } else if (SAVE.equals(action)) {
            JSONObject walk = store.walk();
            if (walk == null) return;
            PendingResult pending = goAsync();
            new Thread(() -> {
                try {
                    save(context, store, walk);
                } finally {
                    pending.finish();
                }
            }).start();
        }
    }

    /**
     * Posts the finished walk to ?/log as the queue would. On any failure the
     * fields go to the outbox for the page; the row id makes a later resend of
     * a save that did land harmless.
     */
    private static void save(Context context, LiveWalkStore store, JSONObject walk) {
        JSONObject fields = finishedFields(walk);
        String id = walk.optString("id");
        boolean stored = post(walk.optString("origin"), fields);

        store.clearWalk();
        store.markSaved(id);
        // Gone either way: the walk behind its buttons has just been cleared.
        LiveWalkNotification.hide(context);
        if (!stored) {
            JSONObject item = new JSONObject();
            try {
                item.put("fields", fields);
                item.put("label", walk.optString("label"));
                item.put("icon", walk.optString("icon"));
            } catch (org.json.JSONException e) {
                // put() only throws on a null key or a NaN.
            }
            store.addToOutbox(item);
            JSONObject words = walk.optJSONObject("words");
            if (words != null) LiveWalkNotification.showPending(context, words);
        }
        LiveWalkPlugin.emitSaved(id);
    }

    /** buildWalkFields' output, with the duration taken at the tap (durationMinutes). */
    static JSONObject finishedFields(JSONObject walk) {
        JSONObject fields = new JSONObject();
        try {
            JSONObject fixed = walk.getJSONObject("fields");
            for (Iterator<String> keys = fixed.keys(); keys.hasNext(); ) {
                String key = keys.next();
                fields.put(key, fixed.getString(key));
            }
            long minutes = Math.max(1, Math.round((System.currentTimeMillis() - walk.getLong("startedAt")) / 60_000.0));
            fields.put("duration_min", String.valueOf(minutes));
            fields.put("pee", String.valueOf(walk.optInt("pee")));
            fields.put("poop", String.valueOf(walk.optInt("poop")));
        } catch (Exception e) {
            // A walk the page stored is always whole; a broken one goes out as far as it got.
        }
        return fields;
    }

    /** True only for an action result that is not a bounce to /login. */
    private static boolean post(String origin, JSONObject fields) {
        HttpURLConnection conn = null;
        try {
            StringBuilder body = new StringBuilder();
            for (Iterator<String> keys = fields.keys(); keys.hasNext(); ) {
                String key = keys.next();
                if (body.length() > 0) body.append('&');
                body.append(URLEncoder.encode(key, "UTF-8")).append('=').append(URLEncoder.encode(fields.optString(key), "UTF-8"));
            }

            CookieManager cookies = CookieManager.getInstance();
            conn = (HttpURLConnection) new URL(origin + "/?/log").openConnection();
            conn.setRequestMethod("POST");
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.setDoOutput(true);
            conn.setRequestProperty("content-type", "application/x-www-form-urlencoded");
            // SvelteKit refuses a form POST without a matching Origin (CSRF).
            conn.setRequestProperty("origin", origin);
            conn.setRequestProperty("accept", "application/json");
            String cookie = cookies.getCookie(origin);
            if (cookie != null) conn.setRequestProperty("cookie", cookie);
            try (OutputStream out = conn.getOutputStream()) {
                out.write(body.toString().getBytes(StandardCharsets.UTF_8));
            }

            int status = conn.getResponseCode();
            // A refreshed session comes back as new cookies. Keeping them is what
            // stops the old refresh token being replayed, which revokes the session.
            for (Map.Entry<String, List<String>> header : conn.getHeaderFields().entrySet()) {
                if (header.getKey() != null && header.getKey().equalsIgnoreCase("set-cookie")) {
                    for (String value : header.getValue()) cookies.setCookie(origin, value);
                }
            }
            cookies.flush();

            if (status != 200) return false;
            JSONObject result = new JSONObject(read(conn.getInputStream()));
            String type = result.optString("type");
            return "success".equals(type) || ("redirect".equals(type) && !result.optString("location").startsWith("/login"));
        } catch (Exception e) {
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private static String read(InputStream in) throws java.io.IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[4096];
        for (int n; (n = in.read(buffer)) > 0; ) out.write(buffer, 0, n);
        return out.toString("UTF-8");
    }
}
