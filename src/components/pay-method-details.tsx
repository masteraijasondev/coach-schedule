import { expectedPayMethodLabel } from "@/lib/pay-formula";

export function PayMethodDetails({
  children,
}: {
  children?: React.ReactNode;
}) {
  return (
    <details className="mb-3 text-sm text-stone-600">
      <summary className="cursor-pointer font-medium text-[#2C2C2C] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2C2C2C]">
        計算方式
      </summary>
      <div className="mt-2 space-y-1 leading-5">
        <p>已確認薪金只計已簽到課堂。</p>
        <p>{expectedPayMethodLabel()}</p>
        {children}
      </div>
    </details>
  );
}
