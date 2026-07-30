import {
  createReportMutationTarget,
  problemResponse,
  proxyAdminMutation,
} from '../../../../../../lib/api/mutation-proxy';

export async function POST(
  request: Request,
  context: Readonly<{ params: Promise<{ action: string; id: string }> }>,
): Promise<Response> {
  const { action, id } = await context.params;
  const target = createReportMutationTarget(id, action);
  if (!target) {
    return problemResponse(request, {
      code: 'REPORT_ACTION_NOT_FOUND',
      detail: 'The requested report action is unavailable.',
      status: 404,
      title: 'Report action not found',
    });
  }
  return proxyAdminMutation(request, target);
}
