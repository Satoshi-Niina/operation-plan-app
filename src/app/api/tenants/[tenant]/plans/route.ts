import { deleteOperationPlan, saveOperationPlan } from "@/lib/data/operations";

type RouteContext = { params: Promise<{ tenant: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const { tenant } = await params;
  const plan = await request.json();
  await saveOperationPlan(tenant, plan);
  return Response.json(plan, { status: 201 });
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const { tenant } = await params;
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return Response.json({ error: "id is required" }, { status: 400 });
  await deleteOperationPlan(tenant, id);
  return new Response(null, { status: 204 });
}