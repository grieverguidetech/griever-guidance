import { createContext, useContext } from 'react';

/**
 * Lets any screen in the flow open the "What you'll need" checklist
 * without threading a callback through every props interface.
 */
const WhatYoullNeedContext = createContext<() => void>(() => {});

export function WhatYoullNeedProvider({
  children,
  onWhatYoullNeed,
}: {
  children: React.ReactNode;
  onWhatYoullNeed: () => void;
}) {
  return (
    <WhatYoullNeedContext.Provider value={onWhatYoullNeed}>
      {children}
    </WhatYoullNeedContext.Provider>
  );
}

export function useWhatYoullNeed(): () => void {
  return useContext(WhatYoullNeedContext);
}
