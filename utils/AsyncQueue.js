class AsyncQueue 
{
  constructor() 
  {
    this.queue = Promise.resolve();
  }

  enqueue(task) 
  {
    const next = this.queue.then(() => task()).catch(err => 
    {
      console.error('[AsyncQueue] Task Error:', err);
    });
    this.queue = next;
    return next;
  }
}

globalThis.AsyncQueue = AsyncQueue;