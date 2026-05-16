import { useState, useEffect, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine
} from "recharts";

const API = "/api";

function fmt(price) {
  if (price == null) return "—";
  return `$${Number(price).toFixed(2)}`;
}
function fmtDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtDateTime(iso) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
function timeSince(iso) {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function Badge({ children, color = "gold" }) {
  const colors = {
    gold: { bg: "#d4a84320", text: "#d4a843", border: "#d4a84340" },
    green: { bg: "#2ecc7120", text: "#2ecc71", border: "#2ecc7140" },
    red: { bg: "#e74c3c20", text: "#e74c3c", border: "#e74c3c40" },
    blue: { bg: "#4a9eff20", text: "#4a9eff", border: "#4a9eff40" },
    muted: { bg: "#ffffff10", text: "#6b6880", border: "#ffffff15" },
  };
  const c = colors[color];
  return (
    <span style={{
      fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.08em",
      padding: "3px 9px", borderRadius: "999px", fontFamily: "var(--font-mono)",
      background: c.bg, color: c.text, border: `1px solid ${c.border}`,
    }}>{children}</span>
  );
}

function PriceTrend({ history }) {
  if (!history || history.length < 2) return null;
  const first = history[0].price;
  const last = history[history.length - 1].price;
  const pct = (((last - first) / first) * 100).toFixed(1);
  const up = last > first;
  return <Badge color={up ? "red" : "green"}>{up ? "▲" : "▼"} {Math.abs(pct)}%</Badge>;
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "#0f0f1c", border: "1px solid #1f1f35",
      borderRadius: 10, padding: "10px 16px",
    }}>
      <div style={{ color: "#6b6880", fontSize: "0.75rem", marginBottom: 4, fontFamily: "var(--font-mono)" }}>{label}</div>
      <div style={{ color: "#d4a843", fontWeight: 700, fontSize: "1.1rem", fontFamily: "var(--font-mono)" }}>{fmt(payload[0].value)}</div>
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ display: "inline-block", width: 14, height: 14, border: "2px solid #1f1f35", borderTopColor: "#d4a843", borderRadius: "50%", animation: "spin 0.7s linear infinite" }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function App() {
  const [products, setProducts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", url: "", selector: "" });
  const [alertForm, setAlertForm] = useState({ target_price: "", email: "" });
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");

  const fetchData = useCallback(async () => {
    try {
      const [pRes, sRes] = await Promise.all([
        fetch(`${API}/products`),
        fetch(`${API}/status`),
      ]);
      const pData = await pRes.json();
      const sData = await sRes.json();
      setProducts(pData);
      setStatus(sData);
      if (pData.length > 0 && !selected) setSelected(pData[0].id);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60000); // refresh UI every 1 min
    return () => clearInterval(interval);
  }, [fetchData]);

  const selectedProduct = products.find((p) => p.id === selected);

  const addProduct = async () => {
    if (!addForm.name || !addForm.url) return;
    setAddLoading(true);
    setAddError("");
    try {
      const res = await fetch(`${API}/products`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });
      const data = await res.json();
      if (!res.ok) { setAddError(data.error || "Failed to add"); return; }
      setProducts((prev) => [data, ...prev]);
      setSelected(data.id);
      setAddForm({ name: "", url: "", selector: "" });
      setShowAdd(false);
    } catch (e) {
      setAddError("Network error");
    } finally {
      setAddLoading(false);
    }
  };

  const deleteProduct = async (id) => {
    if (!confirm("Remove this product?")) return;
    await fetch(`${API}/products/${id}`, { method: "DELETE" });
    setProducts((prev) => prev.filter((p) => p.id !== id));
    const remaining = products.filter((p) => p.id !== id);
    setSelected(remaining[0]?.id || null);
  };

  const checkNow = async () => {
    if (!selected || checking) return;
    setChecking(true);
    try {
      const res = await fetch(`${API}/products/${selected}/check`, { method: "POST" });
      const data = await res.json();
      setProducts((prev) => prev.map((p) => p.id === selected ? data : p));
    } catch (e) { }
    setChecking(false);
  };

  const addAlert = async () => {
    if (!alertForm.target_price || !alertForm.email || !selected) return;
    const res = await fetch(`${API}/products/${selected}/alerts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(alertForm),
    });
    const alert = await res.json();
    if (res.ok) {
      setProducts((prev) => prev.map((p) =>
        p.id === selected ? { ...p, alerts: [...(p.alerts || []), alert] } : p
      ));
      setAlertForm({ target_price: "", email: "" });
      setShowAlert(false);
    }
  };

  const deleteAlert = async (alertId) => {
    await fetch(`${API}/alerts/${alertId}`, { method: "DELETE" });
    setProducts((prev) => prev.map((p) =>
      p.id === selected ? { ...p, alerts: p.alerts.filter((a) => a.id !== alertId) } : p
    ));
  };

  const chartData = selectedProduct?.history?.map((h) => ({
    date: fmtDate(h.checked_at),
    price: h.price,
  })) || [];

  const alertTargets = selectedProduct?.alerts?.filter((a) => !a.triggered).map((a) => a.target_price) || [];
  const lowestPrice = selectedProduct?.history?.length ? Math.min(...selectedProduct.history.map((h) => h.price)) : null;
  const highestPrice = selectedProduct?.history?.length ? Math.max(...selectedProduct.history.map((h) => h.price)) : null;

  // ─── Styles ──────────────────────────────────────────────────────────────

  const sidebarItem = (active) => ({
    padding: "12px 16px",
    cursor: "pointer",
    borderLeft: active ? "3px solid var(--gold)" : "3px solid transparent",
    background: active ? "var(--bg3)" : "transparent",
    transition: "all 0.15s",
  });

  const btn = (variant = "primary") => ({
    padding: variant === "sm" ? "7px 14px" : "10px 20px",
    borderRadius: 8,
    border: variant === "primary" ? "none" : "1px solid var(--border)",
    background: variant === "primary" ? "var(--gold)" : "transparent",
    color: variant === "primary" ? "#080810" : "var(--muted)",
    fontWeight: 700,
    fontSize: "0.82rem",
    fontFamily: "var(--font-mono)",
    letterSpacing: "0.04em",
    transition: "opacity 0.15s",
    whiteSpace: "nowrap",
  });

  const card = {
    background: "var(--bg2)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: "18px 20px",
  };

  const label = {
    fontSize: "0.68rem",
    color: "var(--muted)",
    textTransform: "uppercase",
    letterSpacing: "0.12em",
    fontFamily: "var(--font-mono)",
    display: "block",
    marginBottom: 5,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>

      {/* ─── Header ─────────────────────────────────────────── */}
      <header style={{
        background: "var(--bg2)", borderBottom: "1px solid var(--border)",
        padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.62rem", color: "var(--gold)", letterSpacing: "0.2em", textTransform: "uppercase" }}>◆ Auto Price Intel</div>
            <div style={{ fontSize: "1.25rem", fontWeight: 800, letterSpacing: "-0.03em" }}>Price Tracker</div>
          </div>
          {status && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Badge color="muted">{status.productCount} tracked</Badge>
              <Badge color="blue">{status.alertCount} alerts active</Badge>
              <Badge color="muted">checked {timeSince(status.lastCheck)}</Badge>
            </div>
          )}
        </div>
        <button style={btn("primary")} onClick={() => { setShowAdd(!showAdd); setAddError(""); }}>
          {showAdd ? "✕ Cancel" : "+ Add Product"}
        </button>
      </header>

      {/* ─── Add Product Panel ───────────────────────────────── */}
      {showAdd && (
        <div style={{
          background: "var(--bg3)", borderBottom: "1px solid var(--border)",
          padding: "16px 24px", display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end",
          animation: "fadeIn 0.2s ease",
        }}>
          <div style={{ flex: "2 1 180px" }}>
            <label style={label}>Product Name *</label>
            <input value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Sony WH-1000XM5" />
          </div>
          <div style={{ flex: "3 1 260px" }}>
            <label style={label}>Product URL *</label>
            <input value={addForm.url} onChange={(e) => setAddForm((f) => ({ ...f, url: e.target.value }))} placeholder="https://amazon.com/dp/..." />
          </div>
          <div style={{ flex: "1 1 160px" }}>
            <label style={label}>CSS Selector (optional)</label>
            <input value={addForm.selector} onChange={(e) => setAddForm((f) => ({ ...f, selector: e.target.value }))} placeholder=".a-price-whole" />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <button style={btn("primary")} onClick={addProduct} disabled={addLoading}>
              {addLoading ? "Fetching..." : "Track Product"}
            </button>
            {addError && <span style={{ color: "var(--red)", fontSize: "0.72rem", fontFamily: "var(--font-mono)" }}>⚠ {addError}</span>}
          </div>
        </div>
      )}

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ─── Sidebar ─────────────────────────────────────────── */}
        <aside style={{
          width: 230, minWidth: 180, borderRight: "1px solid var(--border)",
          background: "var(--bg2)", overflowY: "auto", flexShrink: 0,
        }}>
          {loading && (
            <div style={{ padding: 24, color: "var(--muted)", fontSize: "0.82rem", textAlign: "center" }}>
              <Spinner /> Loading...
            </div>
          )}
          {!loading && products.length === 0 && (
            <div style={{ padding: "32px 16px", color: "var(--muted)", fontSize: "0.82rem", textAlign: "center", lineHeight: 1.7 }}>
              No products yet.<br />Add one to start tracking.
            </div>
          )}
          {products.map((p) => (
            <div key={p.id} onClick={() => setSelected(p.id)} style={sidebarItem(selected === p.id)}>
              <div style={{
                fontSize: "0.85rem", fontWeight: 600, marginBottom: 4,
                color: selected === p.id ? "var(--text)" : "var(--muted)",
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
              }}>{p.name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.95rem", fontWeight: 700, color: "var(--gold)" }}>
                  {fmt(p.current_price)}
                </span>
                <PriceTrend history={p.history} />
              </div>
              {p.last_error && <div style={{ fontSize: "0.65rem", color: "var(--red)", marginTop: 3 }}>⚠ Error</div>}
            </div>
          ))}
        </aside>

        {/* ─── Main Content ─────────────────────────────────────── */}
        <main style={{ flex: 1, overflowY: "auto", padding: "24px 28px" }}>
          {!selectedProduct && !loading && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "var(--muted)" }}>
              Add a product to start tracking prices automatically.
            </div>
          )}

          {selectedProduct && (
            <div className="fade-in">
              {/* Product header */}
              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 22, flexWrap: "wrap", gap: 12 }}>
                <div>
                  <h1 style={{ fontSize: "1.5rem", fontWeight: 800, letterSpacing: "-0.03em", marginBottom: 5 }}>
                    {selectedProduct.name}
                  </h1>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                    {selectedProduct.url && (
                      <a href={selectedProduct.url} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: "0.75rem", color: "var(--accent)", fontFamily: "var(--font-mono)", textDecoration: "none" }}>
                        ↗ View Product
                      </a>
                    )}
                    <span style={{ fontSize: "0.72rem", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                      Last checked: {timeSince(selectedProduct.last_checked)}
                    </span>
                    {selectedProduct.last_error && (
                      <Badge color="red">⚠ {selectedProduct.last_error.slice(0, 50)}</Badge>
                    )}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button style={btn("sm")} onClick={checkNow} disabled={checking}>
                    {checking ? <><Spinner /> Checking...</> : "⟳ Check Now"}
                  </button>
                  <button style={{ ...btn("sm"), color: "var(--gold)", borderColor: "#d4a84340" }}
                    onClick={() => setShowAlert(!showAlert)}>
                    🔔 Set Alert
                  </button>
                  <button style={{ ...btn("sm"), color: "var(--red)", borderColor: "#e74c3c30" }}
                    onClick={() => deleteProduct(selectedProduct.id)}>
                    ✕ Remove
                  </button>
                </div>
              </div>

              {/* Alert Form */}
              {showAlert && (
                <div style={{ ...card, marginBottom: 20, animation: "fadeIn 0.2s ease" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--gold)", fontFamily: "var(--font-mono)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 14 }}>
                    🔔 Price Alert
                  </div>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                    <div style={{ flex: "1 1 120px" }}>
                      <label style={label}>Alert when price drops to</label>
                      <input type="number" value={alertForm.target_price}
                        onChange={(e) => setAlertForm((f) => ({ ...f, target_price: e.target.value }))}
                        placeholder="e.g. 199.99" />
                    </div>
                    <div style={{ flex: "2 1 200px" }}>
                      <label style={label}>Notify email</label>
                      <input type="email" value={alertForm.email}
                        onChange={(e) => setAlertForm((f) => ({ ...f, email: e.target.value }))}
                        placeholder="you@example.com" />
                    </div>
                    <button style={btn("primary")} onClick={addAlert}>Create Alert</button>
                    <button style={btn("sm")} onClick={() => setShowAlert(false)}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Active Alerts */}
              {selectedProduct.alerts?.filter((a) => !a.triggered).length > 0 && (
                <div style={{ ...card, marginBottom: 20 }}>
                  <div style={{ fontSize: "0.72rem", color: "var(--muted)", fontFamily: "var(--font-mono)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 12 }}>
                    Active Alerts
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {selectedProduct.alerts.filter((a) => !a.triggered).map((a) => (
                      <div key={a.id} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        background: "var(--bg3)", borderRadius: 8, padding: "10px 14px",
                      }}>
                        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                          <span style={{ fontFamily: "var(--font-mono)", color: "var(--gold)", fontWeight: 700 }}>
                            🔔 Alert at {fmt(a.target_price)}
                          </span>
                          <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>→ {a.email}</span>
                        </div>
                        <button onClick={() => deleteAlert(a.id)}
                          style={{ background: "none", border: "none", color: "var(--muted)", fontSize: "0.9rem" }}>✕</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Triggered Alerts */}
              {selectedProduct.alerts?.filter((a) => a.triggered).length > 0 && (
                <div style={{ ...card, marginBottom: 20, borderColor: "#2ecc7130" }}>
                  <div style={{ fontSize: "0.72rem", color: "var(--green)", fontFamily: "var(--font-mono)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
                    ✓ Triggered Alerts
                  </div>
                  {selectedProduct.alerts.filter((a) => a.triggered).map((a) => (
                    <div key={a.id} style={{ fontSize: "0.8rem", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                      Alert sent for {fmt(a.target_price)} on {fmtDateTime(a.triggered_at)}
                    </div>
                  ))}
                </div>
              )}

              {/* Stats row */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 20 }}>
                {[
                  { label: "Current Price", val: fmt(selectedProduct.current_price), color: "var(--gold)" },
                  { label: "Lowest Ever", val: fmt(lowestPrice), color: "var(--green)" },
                  { label: "Highest Ever", val: fmt(highestPrice), color: "var(--red)" },
                ].map(({ label: l, val, color }) => (
                  <div key={l} style={card}>
                    <div style={{ fontSize: "0.67rem", color: "var(--muted)", fontFamily: "var(--font-mono)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>{l}</div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 800, fontFamily: "var(--font-mono)", color }}>{val}</div>
                  </div>
                ))}
              </div>

              {/* Chart */}
              <div style={{ ...card, marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <div style={{ fontSize: "0.72rem", color: "var(--muted)", fontFamily: "var(--font-mono)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                    Price History Chart
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <PriceTrend history={selectedProduct.history} />
                    <Badge color="muted">{selectedProduct.history?.length || 0} data points</Badge>
                  </div>
                </div>
                {chartData.length < 2 ? (
                  <div style={{ textAlign: "center", padding: "40px 0", color: "var(--muted)", fontSize: "0.85rem" }}>
                    Waiting for more price data. Auto-checked every 30 minutes.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f1f35" />
                      <XAxis dataKey="date" tick={{ fill: "#6b6880", fontSize: 11, fontFamily: "Syne Mono" }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: "#6b6880", fontSize: 11, fontFamily: "Syne Mono" }} axisLine={false} tickLine={false}
                        tickFormatter={(v) => `$${v}`} width={60} />
                      <Tooltip content={<CustomTooltip />} />
                      {alertTargets.map((t, i) => (
                        <ReferenceLine key={i} y={t} stroke="#d4a843" strokeDasharray="5 3"
                          label={{ value: `Alert $${t}`, fill: "#d4a843", fontSize: 10 }} />
                      ))}
                      <Line type="monotone" dataKey="price" stroke="#d4a843" strokeWidth={2.5}
                        dot={{ fill: "#d4a843", r: 3, strokeWidth: 0 }}
                        activeDot={{ r: 6, fill: "#fff", stroke: "#d4a843", strokeWidth: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Price Log */}
              <div style={card}>
                <div style={{ fontSize: "0.72rem", color: "var(--muted)", fontFamily: "var(--font-mono)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}>
                  Price Log
                </div>
                {!selectedProduct.history?.length && (
                  <div style={{ color: "var(--muted)", fontSize: "0.82rem" }}>No price data yet.</div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {[...( selectedProduct.history || [])].reverse().slice(0, 20).map((h, i) => (
                    <div key={i} style={{
                      display: "flex", justifyContent: "space-between",
                      padding: "8px 12px", background: "var(--bg3)", borderRadius: 7,
                    }}>
                      <span style={{ fontSize: "0.78rem", color: "var(--muted)", fontFamily: "var(--font-mono)" }}>
                        {fmtDateTime(h.checked_at)}
                      </span>
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--gold)" }}>
                        {fmt(h.price)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
