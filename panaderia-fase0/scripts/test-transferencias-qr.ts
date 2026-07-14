import assert from "node:assert/strict";
import { parsearQRSync, detectarSucursal } from "../src/lib/transferencias-qr";

const fixtures = [
  {
    name: "BP_TO_DEUNA #1",
    crudo: "ONLINE: BP_TO_DEUNA :DeUna:Juan Pérez:****1111:DeUna:Silvia Patricia Morales Parra:****5688:15.50:1719235200:550e8400-e29b-41d4-a716-446655440000:123456:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    expected: {
      monto: 15.5,
      comprobante: "123456",
      beneficiario: "Silvia Patricia Morales Parra",
      sucursal: "Consejo",
    },
  },
  {
    name: "BP_TO_DEUNA #2",
    crudo: "ONLINE:BP_TO_DEUNA:DeUna:Daniel Sebastian Herrera Morales:****2222:DeUna:Daniel Sebastian Herrera Morales:****4146:1.60:1719235200:660e8400-e29b-41d4-a716-446655440001:987654:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    expected: {
      monto: 1.6,
      comprobante: "987654",
      beneficiario: "Daniel Sebastian Herrera Morales",
      sucursal: "Principal",
    },
  },
  {
    name: "P2P Deuna → Deuna",
    crudo: "ONLINE:P2P:DeUna:KATTY ELIZABETH PASTUIZACA CASTRO:***1214:DeUna:Silvia Patricia Morales Parra:***5688:1.6:1784057661038:120f9ceb-41e0-4d0a-83b4-875d57e3de9f:181200717593:57bde3824e4f3a291874ebef71cf0166db14c40efb0538d07be5a173a943802ea50e903ff68637f723c7385acecf209118fc582eb95dd15d28e717fa2119f60e",
    expected: {
      monto: 1.6,
      comprobante: "181200717593",
      beneficiario: "Silvia Patricia Morales Parra",
      sucursal: "Consejo",
    },
  },
];

for (const fixture of fixtures) {
  const parsed = parsearQRSync(fixture.crudo);
  assert.ok(parsed.confiable, `${fixture.name}: debe ser confiable`);
  assert.equal(parsed.monto, fixture.expected.monto, `${fixture.name}: monto`);
  assert.equal(parsed.comprobante, fixture.expected.comprobante, `${fixture.name}: comprobante`);
  assert.equal(parsed.beneficiario, fixture.expected.beneficiario, `${fixture.name}: beneficiario`);
  assert.equal(
    detectarSucursal(parsed.beneficiario, parsed.cuentaEnmascarada),
    fixture.expected.sucursal,
    `${fixture.name}: sucursal`
  );
  console.log(`✅ ${fixture.name}`);
}

console.log("Todos los fixtures pasaron.");
