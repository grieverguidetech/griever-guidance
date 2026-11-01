import { PRODUCT_NAME } from '@griever/shared';

/**
 * The bar across the top of the editor: the product name and nothing else. It is text because the
 * repo holds no logo image yet (#566); swap the text for the image here when one is added.
 * The image needs alt="Grievers Guidance".
 */
export function AppHeader() {
  return (
    <header className="flex items-center min-h-11 py-2">
      <p className="m-0 text-lg font-semibold">{PRODUCT_NAME}</p>
    </header>
  );
}
