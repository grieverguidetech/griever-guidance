import { useState } from 'react';
import { useSendFlow } from '@griever/hooks';
import { obituaryLink } from '@griever/shared';
import { TemplatePicker } from '../screens/TemplatePicker';
import { DetailsForm } from '../screens/DetailsForm';
import { ContactSelector } from '../screens/ContactSelector';
import { ConfirmScreen } from '../screens/ConfirmScreen';
import { SentScreen } from '../screens/SentScreen';
import { HistoryScreen } from '../screens/HistoryScreen';
import { ObituaryScreen } from '../screens/ObituaryScreen';

type AppView = 'flow' | 'history' | 'obituary';

export function App() {
  const flow = useSendFlow();
  const [view, setView] = useState<AppView>('flow');

  if (view === 'history') {
    return (
      <div className="min-h-screen bg-white flex justify-center">
        <div className="w-full max-w-[480px] px-4 py-8">
          <HistoryScreen onBack={() => setView('flow')} />
        </div>
      </div>
    );
  }

  if (view === 'obituary') {
    function handleShareObituaryLink() {
      flow.setTemplate(obituaryLink);
      flow.nextStep();
      setView('flow');
    }

    return (
      <div className="min-h-screen bg-white flex justify-center">
        <div className="w-full max-w-[480px] px-4 py-8">
          <ObituaryScreen
            onBack={() => setView('flow')}
            onShareLink={handleShareObituaryLink}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white flex justify-center">
      <div className="w-full max-w-[480px] px-4 py-8">
        {flow.step === 'template' && (
          <div className="flex justify-between mb-4">
            <button
              onClick={() => setView('obituary')}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Write an obituary
            </button>
            <button
              onClick={() => setView('history')}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              View sent messages
            </button>
          </div>
        )}
        {flow.step === 'template' && <TemplatePicker flow={flow} />}
        {flow.step === 'details' && <DetailsForm flow={flow} />}
        {flow.step === 'contacts' && <ContactSelector flow={flow} />}
        {flow.step === 'confirm' && <ConfirmScreen flow={flow} />}
        {flow.step === 'sent' && (
          <SentScreen flow={flow} onViewHistory={() => setView('history')} />
        )}
      </div>
    </div>
  );
}

export default App;
