import { useTemplates } from '@griever/hooks';
import type { SendFlowState, SendFlowActions } from '@griever/hooks';
import { categoryLabels } from '@griever/shared';
import type { TemplateCategory } from '@griever/shared';

interface Props {
  flow: SendFlowState & SendFlowActions;
}

const CATEGORY_ORDER: TemplateCategory[] = ['announcement', 'service', 'aftercare'];

export function TemplatePicker({ flow }: Props) {
  const templates = useTemplates();

  const grouped = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    templates: templates.filter((t) => t.category === cat),
  })).filter((g) => g.templates.length > 0);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-2">
        Griever Guidance
      </h1>
      <p className="text-gray-500 mb-8 text-sm">
        Choose the type of message you would like to send.
      </p>
      <div className="flex flex-col gap-6">
        {grouped.map(({ category, templates: group }) => (
          <div key={category}>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
              {categoryLabels[category]}
            </p>
            <div className="flex flex-col gap-3">
              {group.map((template) => (
                <button
                  key={template.id}
                  onClick={() => {
                    flow.setTemplate(template);
                    flow.nextStep();
                  }}
                  className="w-full text-left border border-gray-200 rounded-lg px-5 py-4 hover:border-[#6B7FD4] hover:bg-indigo-50 transition-colors"
                >
                  <div className="font-medium text-gray-900">{template.name}</div>
                  <div className="text-sm text-gray-500 mt-1">{template.description}</div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
