import {FileInboxAdapter} from '../dist/src/index.js';

export function createAdapter() {
  const directory = process.env.CAPTIONKEEP_ASSISTANT_INBOX;
  if (!directory) throw new Error('CAPTIONKEEP_ASSISTANT_INBOX must be an absolute customer-owned directory.');
  return new FileInboxAdapter(directory);
}
