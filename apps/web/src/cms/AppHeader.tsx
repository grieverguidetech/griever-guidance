/**
 * The bar across the top of the editor: the product wordmark and nothing else. The wordmark is a
 * SAMPLE (#583); replace /brand/wordmark.svg when real brand material exists.
 */
export function AppHeader() {
  return (
    <header className="flex items-center min-h-11 py-2">
      <img src="/brand/wordmark.svg" alt="Grievers Guidance" width={188} height={24} className="h-6 w-auto" />
    </header>
  );
}
