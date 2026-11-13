package app.pesatrack;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;

// Wakes the app about once a day (also after a restart) to check whether last month's summary is due.
public class SummaryJobService extends JobService {
    private static final int JOB_ID = 4002;

    static void schedule(Context c) {
        try {
            JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (js == null || js.getPendingJob(JOB_ID) != null) return;
            js.schedule(new JobInfo.Builder(JOB_ID, new ComponentName(c, SummaryJobService.class))
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setPeriodic(24L * 60 * 60 * 1000)
                    .setPersisted(true)
                    .build());
        } catch (Exception ignored) {}
    }

    @Override public boolean onStartJob(final JobParameters params) {
        final Context c = getApplicationContext();
        new Thread(() -> jobFinished(params, !MonthSummary.run(c, false))).start();   // false = couldn't finish, try again later
        return true;
    }

    @Override public boolean onStopJob(JobParameters params) { return true; }
}
