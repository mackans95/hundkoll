package se.hundkoll.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.widget.RemoteViews;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import org.json.JSONObject;

/** The lock-screen notification for a running walk, and its "sent later" variant. */
final class LiveWalkNotification {

    static final String CHANNEL = "live-walk";
    private static final int ID = 2001;
    // Its own id, so hiding a walk never takes the "sent later" notice with it.
    private static final int PENDING_ID = 2002;

    private LiveWalkNotification() {}

    static void show(Context context, JSONObject walk) {
        JSONObject words = walk.optJSONObject("words");
        if (words == null) return;
        ensureChannel(context, words.optString("channel"));

        // Ensamtid after Hemma (plan 23): nothing left to tap but the answer, in the app.
        boolean timing = "timing".equals(walk.optString("kind"));
        long endedAt = walk.optLong("endedAt");
        if (timing && endedAt > 0) {
            long minutes = Math.max(1, Math.round((endedAt - walk.optLong("startedAt")) / 60_000.0));
            post(
                context,
                base(context)
                    .setContentTitle(words.optString("stopped") + " " + minutes + " " + words.optString("minutes"))
                    .setContentText(words.optString("answer"))
                    .setOnlyAlertOnce(true)
                    .setSilent(true)
            );
            return;
        }

        // A custom view, so the buttons show without expanding. That rules out
        // Android 16's promotion to a Live Update, which OnePlus did not grant anyway.
        RemoteViews small = buttons(context, walk, words, R.layout.notification_live_walk, timing);
        RemoteViews big = buttons(context, walk, words, R.layout.notification_live_walk_big, timing);
        big.setTextViewText(R.id.live_walk_title, words.optString("title"));

        NotificationCompat.Builder builder = base(context)
            .setContentTitle(words.optString("title"))
            .setStyle(new NotificationCompat.DecoratedCustomViewStyle())
            .setCustomContentView(small)
            .setCustomBigContentView(big)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setWhen(walk.optLong("startedAt"))
            .setShowWhen(true)
            .setUsesChronometer(true);

        post(context, builder);
    }

    private static RemoteViews buttons(Context context, JSONObject walk, JSONObject words, int layout, boolean timing) {
        RemoteViews views = new RemoteViews(context.getPackageName(), layout);
        if (timing) {
            // Ensamtid only times: one button, Hemma, which stops the clock.
            views.setViewVisibility(R.id.live_walk_pee, android.view.View.GONE);
            views.setViewVisibility(R.id.live_walk_poop, android.view.View.GONE);
            views.setTextViewText(R.id.live_walk_save, words.optString("home"));
            views.setOnClickPendingIntent(R.id.live_walk_save, broadcast(context, LiveWalkReceiver.HOME));
            return views;
        }
        views.setTextViewText(R.id.live_walk_pee, words.optString("addPee") + " · " + walk.optInt("pee"));
        views.setTextViewText(R.id.live_walk_poop, words.optString("addPoop") + " · " + walk.optInt("poop"));
        views.setTextViewText(R.id.live_walk_save, words.optString("save"));
        views.setOnClickPendingIntent(R.id.live_walk_pee, broadcast(context, LiveWalkReceiver.ADD_PEE));
        views.setOnClickPendingIntent(R.id.live_walk_poop, broadcast(context, LiveWalkReceiver.ADD_POOP));
        views.setOnClickPendingIntent(R.id.live_walk_save, broadcast(context, LiveWalkReceiver.SAVE));
        return views;
    }

    /** Spara could not reach the server: the walk is kept for the app to send. */
    static void showPending(Context context, JSONObject words) {
        ensureChannel(context, words.optString("channel"));
        try {
            NotificationManagerCompat.from(context).notify(
                PENDING_ID,
                base(context).setContentTitle(words.optString("pendingTitle")).setContentText(words.optString("pendingBody")).setAutoCancel(true).build()
            );
        } catch (SecurityException e) {
            // Notification permission taken back in Android's settings.
        }
    }

    static void hide(Context context) {
        NotificationManagerCompat.from(context).cancel(ID);
    }

    /** The page has taken the unsent walks, so "sent when you open the app" is done. */
    static void hidePending(Context context) {
        NotificationManagerCompat.from(context).cancel(PENDING_ID);
    }

    private static NotificationCompat.Builder base(Context context) {
        Intent open = new Intent(context, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_paw)
            .setColor(ContextCompat.getColor(context, R.color.notification))
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(PendingIntent.getActivity(context, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
    }

    private static PendingIntent broadcast(Context context, String action) {
        Intent intent = new Intent(context, LiveWalkReceiver.class).setAction(action);
        return PendingIntent.getBroadcast(context, action.hashCode(), intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static void post(Context context, NotificationCompat.Builder builder) {
        try {
            NotificationManagerCompat.from(context).notify(ID, builder.build());
        } catch (SecurityException e) {
            // Notification permission taken back in Android's settings.
        }
    }

    private static void ensureChannel(Context context, String name) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        // Default importance, silenced: it redraws on every tap and must not buzz.
        NotificationChannel channel = new NotificationChannel(CHANNEL, name, NotificationManager.IMPORTANCE_DEFAULT);
        channel.setSound(null, null);
        channel.enableVibration(false);
        context.getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }
}
