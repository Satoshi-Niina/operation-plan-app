import { deleteOperationPlan, saveOperationPlan } from "@/lib/data/operations";
import { logOperation, logSystemError } from "@/lib/auditLogger";

type RouteContext = { params: Promise<{ tenant: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const { tenant } = await params;
  try {
    const plan = await request.json();
    await saveOperationPlan(tenant, plan);
    logOperation(request, {
      action: "save_plan",
      targetType: "operation_plan",
      targetId: plan?.id,
      tenant,
      status: "success",
    });
    return Response.json(plan, { status: 201 });
  } catch (error) {
    logSystemError(request, error, { errorCode: "SAVE_PLAN_FAILED", tenant });
    return Response.json({ error: "Failed to save operation plan" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const { tenant } = await params;
  try {
    const id = new URL(request.url).searchParams.get("id");
    if (!id) return Response.json({ error: "id is required" }, { status: 400 });
    await deleteOperationPlan(tenant, id);
    logOperation(request, {
      action: "delete_plan",
      targetType: "operation_plan",
      targetId: id,
      tenant,
      status: "success",
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    logSystemError(request, error, { errorCode: "DELETE_PLAN_FAILED", tenant });
    return Response.json({ error: "Failed to delete operation plan" }, { status: 500 });
  }
}