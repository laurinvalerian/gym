package de.gymlog.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

/** Deload-Erinnerung als Push-Benachrichtigung. Überlebt auch einen Neustart des Handys. */
public class ReminderReceiver extends BroadcastReceiver {
    static final String CH = "deload";

    static PendingIntent pi(Context ctx) {
        Intent i = new Intent(ctx, ReminderReceiver.class).setAction("de.gymlog.app.REMIND");
        return PendingIntent.getBroadcast(ctx, 9, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void schedule(Context ctx, long at) {
        SharedPreferences p = ctx.getSharedPreferences("gymlog", Context.MODE_PRIVATE);
        p.edit().putLong("remindAt", at).apply();
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        am.cancel(pi(ctx));
        if (at > System.currentTimeMillis()) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi(ctx));
    }

    static void cancel(Context ctx) {
        ctx.getSharedPreferences("gymlog", Context.MODE_PRIVATE).edit().remove("remindAt").apply();
        ((AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE)).cancel(pi(ctx));
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        String a = intent.getAction();
        if (Intent.ACTION_BOOT_COMPLETED.equals(a) || Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) {
            long at = ctx.getSharedPreferences("gymlog", Context.MODE_PRIVATE).getLong("remindAt", 0);
            if (at > System.currentTimeMillis()) schedule(ctx, at);
            return;
        }
        NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm.getNotificationChannel(CH) == null) {
            nm.createNotificationChannel(new NotificationChannel(CH, "Deload-Erinnerung", NotificationManager.IMPORTANCE_DEFAULT));
        }
        Intent open = new Intent(ctx, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent cp = PendingIntent.getActivity(ctx, 1, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        String text = "Es wäre mal wieder Zeit für einen Deload. Wie fühlst du dich?";
        Notification n = new Notification.Builder(ctx, CH)
                .setSmallIcon(R.drawable.ic_stat)
                .setContentTitle("Hey, Zeit für einen Deload 💪")
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setContentIntent(cp)
                .setAutoCancel(true)
                .build();
        try { nm.notify(43, n); } catch (SecurityException ignored) {}
    }
}
