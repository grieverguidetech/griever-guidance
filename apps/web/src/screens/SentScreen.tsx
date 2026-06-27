import type { SendFlowState, SendFlowActions } from '@griever/hooks';

interface Props {
  flow: SendFlowState & SendFlowActions;
  onViewHistory: () => void;
}

export function SentScreen({ flow, onViewHistory }: Props) {
  const { selectedContacts, filledFields, reset } = flow;
  const name = filledFields['deceasedName'] ?? '';

  return (
    <div className="flex flex-col items-center text-center pt-16">
      <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center mb-6">
        <svg className="w-6 h-6 text-[#6B7FD4]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h2 className="text-xl font-semibold text-gray-900 mb-3">
        Your messages have been sent.
      </h2>
      <p className="text-sm text-gray-500 mb-2">
        {selectedContacts.length} {selectedContacts.length === 1 ? 'person' : 'people'} will receive details
        {name ? ` about ${name}` : ''}.
      </p>
      <p className="text-sm text-gray-400 mb-10">
        We are sorry for your loss.
      </p>
      <button
        onClick={reset}
        className="text-sm text-[#6B7FD4] hover:underline"
      >
        Send another message
      </button>
      <button
        onClick={onViewHistory}
        className="text-sm text-gray-400 hover:text-gray-600 mt-2"
      >
        View sent messages
      </button>
    </div>
  );
}
