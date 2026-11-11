package app.pesatrack;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;

// Wakes the app by itself when the phone gets internet again (also after a restart) and sends any M-Pesa messages that were waiting.
public class RetryJobService extends JobService {
    private static final int JOB_ID = 4001;

    static void schedule(Context c) {
        try {
            JobScheduler js = (JobScheduler) c.getSystemService(Context.JOB_SCHEDULER_SERVICE);
            if (js == null) return;
            js.schedule(new JobInfo.Builder(JOB_ID, new ComponentName(c, RetryJobService.class))
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setBackoffCriteria(30000, JobInfo.BACKOFF_POLICY_EXPONENTIAL)
                    .setPersisted(true)
                    .build());
        } catch (Exception ignored) {}
    }

    @Override public boolean onStartJob(final JobParameters params) {
        final Context c = getApplicationContext();
        new Thread(() -> {
            Sender.flush(c);
            jobFinished(params, Sender.hasQueue(c));   // true = try again later
        }).start();
        return true;
    }

    @Override public boolean onStopJob(JobParameters params) { return true; }
}
