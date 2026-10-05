package se.hundkoll.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import org.json.JSONObject;

/**
 * The buzz when a planned Ensamtid is up (plan 24). Exact, because the plan is
 * minutes under where she grows anxious; a sideloaded app holds USE_EXACT_ALARM
 * without a prompt. Rescheduled on every show, so changing the plan moves it.
 */
final class LiveWalkAlarm {

    private LiveWalkAlarm() {}

    /** Arms the alarm for a running, planned timing session, and disarms it otherwise. */
    static void sync(Context context, JSONObject walk) {
        long at = walk.optLong("plannedAt");
        boolean armed = "timing".equals(walk.optString("kind"))
            && walk.optLong("endedAt") <= 0
            && at > System.currentTimeMillis();
        if (!armed) {
            cancel(context);
            return;
        }
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        PendingIntent intent = pending(context, walk.optString("id"));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarms.canScheduleExactAlarms()) {
            // Permission withdrawn in Android's settings: late beats never.
            alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent);
        } else {
            alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, intent);
        }
    }

    static void cancel(Context context) {
        context.getSystemService(AlarmManager.class).cancel(pending(context, ""));
    }

    // One alarm at a time: the request code and action are fixed, so a new
    // schedule replaces the old one and cancel finds it whatever its extra.
    private static PendingIntent pending(Context context, String id) {
        Intent intent = new Intent(context, LiveWalkReceiver.class)
            .setAction(LiveWalkReceiver.ALERT)
            .putExtra("id", id);
        return PendingIntent.getBroadcast(context, 2003, intent, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }
}
