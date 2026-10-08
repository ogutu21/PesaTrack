// Currency settings and formatting. Amounts are always stored in the BASE currency;
// anything entered in another currency is converted at entry and the original is kept on the transaction.
export const CURRENCIES = [
    ["KES", "Kenyan Shilling"], ["USD", "US Dollar"], ["EUR", "Euro"], ["GBP", "British Pound"],
    ["UGX", "Ugandan Shilling"], ["TZS", "Tanzanian Shilling"], ["RWF", "Rwandan Franc"], ["ETB", "Ethiopian Birr"],
    ["NGN", "Nigerian Naira"], ["ZAR", "South African Rand"], ["AED", "UAE Dirham"], ["INR", "Indian Rupee"],
    ["CNY", "Chinese Yuan"], ["CAD", "Canadian Dollar"], ["AUD", "Australian Dollar"]
];
let base = "KES", rates = {}, fmt = make("KES");

function make(code) {
    try { return new Intl.NumberFormat("en-KE", { style: "currency", currency: code, minimumFractionDigits: 2 }); }
    catch { return new Intl.NumberFormat("en-KE", { minimumFractionDigits: 2 }); }
}
export const getBase = () => base;
export const getRates = () => rates;
export function setCurrencySettings(s) {
    base = /^[A-Z]{3}$/.test(s?.base || "") ? s.base : "KES";
    rates = s && s.rates && typeof s.rates === "object" ? Object.fromEntries(Object.entries(s.rates).filter(([k, v]) => /^[A-Z]{3}$/.test(k) && Number(v) > 0)) : {};
    fmt = make(base);
}
export const formatMoney = amount => fmt.format(amount);
export const formatIn = (amount, code) => make(code).format(amount);
export const convert = (amount, rate) => Math.round(Number(amount) * Number(rate) * 100) / 100;
