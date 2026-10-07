const jobs = new Map();

export function createAdapter() {
  return {
    async submit(request) {
      const remoteJobId = `example-${request.jobId}`;
      jobs.set(remoteJobId, {state: 'queued', request});
      return {state: 'queued', remoteJobId};
    },
    async status(request) {
      const job = jobs.get(request.remoteJobId);
      return job
        ? {state: job.state, remoteJobId: request.remoteJobId}
        : {state: 'failed', remoteJobId: request.remoteJobId, errorCode: 'NOT_FOUND', errorMessage: 'Example job not found.'};
    },
    async cancel(request) {
      jobs.delete(request.remoteJobId);
      return {state: 'cancelled', remoteJobId: request.remoteJobId};
    }
  };
}
