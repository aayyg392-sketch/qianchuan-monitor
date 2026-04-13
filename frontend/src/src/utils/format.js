export const fmtMoney = (v) => v == null ? "-" : "¥" + parseFloat(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
export const fmtNum = (v) => v == null ? "-" : parseInt(v).toLocaleString()
export const fmtPct = (v) => v == null ? "-" : (parseFloat(v) * 100).toFixed(2) + "%"
export const fmtRate = (v) => v == null ? "-" : (parseFloat(v) * 100).toFixed(2) + "%"
export const fmtDecimal = (v, d = 2) => v == null ? "-" : parseFloat(v).toFixed(d)
