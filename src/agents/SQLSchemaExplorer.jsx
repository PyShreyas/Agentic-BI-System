import { useEffect, useMemo, useState } from "react";

const storageKey = "agenticBi.sqlSchemaCatalog.v1";
const createId = () => "schema_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
const identifierPattern = /^[A-Za-z_][A-Za-z0-9_$#]*$/;

function normalizeCatalog(value) {
  if (!value || !Array.isArray(value.tables) || !Array.isArray(value.relationships)) {
    throw new Error("JSON must contain tables and relationships arrays.");
  }
  const tables = value.tables.map((table, index) => {
    if (!table || typeof table.schemaName !== "string" || typeof table.objectName !== "string" ||
      !identifierPattern.test(table.schemaName.trim()) || !identifierPattern.test(table.objectName.trim()) ||
      !["TABLE", "VIEW"].includes(table.objectType) || !Array.isArray(table.columns)) {
      throw new Error("Invalid table/view metadata at item " + (index + 1) + ".");
    }
    return {
      id: typeof table.id === "string" ? table.id : createId(),
      schemaName: table.schemaName.trim(),
      objectName: table.objectName.trim(),
      objectType: table.objectType,
      description: typeof table.description === "string" ? table.description : "",
      columns: table.columns.map((column, columnIndex) => {
        if (!column || typeof column.name !== "string" || !identifierPattern.test(column.name.trim()) ||
          typeof column.dataType !== "string" || !column.dataType.trim()) {
          throw new Error("Invalid column metadata in " + table.schemaName + "." + table.objectName + " at column " + (columnIndex + 1) + ".");
        }
        return {
          name: column.name.trim(),
          dataType: column.dataType.trim(),
          isNullable: Boolean(column.isNullable),
          isPrimaryKey: Boolean(column.isPrimaryKey),
          isForeignKey: Boolean(column.isForeignKey)
        };
      })
    };
  });
  const tableIds = new Set(tables.map(table => table.id));
  const relationships = value.relationships.map((relationship, index) => {
    if (!relationship || !tableIds.has(relationship.fromObjectId) || !tableIds.has(relationship.toObjectId) ||
      typeof relationship.fromColumn !== "string" || typeof relationship.toColumn !== "string") {
      throw new Error("Invalid relationship metadata at item " + (index + 1) + ".");
    }
    const fromTable = tables.find(table => table.id === relationship.fromObjectId);
    const toTable = tables.find(table => table.id === relationship.toObjectId);
    if (!fromTable.columns.some(column => column.name === relationship.fromColumn) ||
      !toTable.columns.some(column => column.name === relationship.toColumn)) {
      throw new Error("A relationship refers to a column that does not exist.");
    }
    return {
      id: typeof relationship.id === "string" ? relationship.id : createId(),
      fromObjectId: relationship.fromObjectId,
      fromColumn: relationship.fromColumn,
      toObjectId: relationship.toObjectId,
      toColumn: relationship.toColumn,
      relationshipType: ["1:1", "1:many", "many:1", "many:many"].includes(relationship.relationshipType) ? relationship.relationshipType : "1:many"
    };
  });
  return { tables, relationships };
}

export default function SQLSchemaExplorer({ C }) {
  const [catalog, setCatalog] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? normalizeCatalog(JSON.parse(stored)) : { tables: [], relationships: [] };
    } catch {
      return { tables: [], relationships: [] };
    }
  });
  const [schemaName, setSchemaName] = useState("dbo");
  const [objectName, setObjectName] = useState("");
  const [objectType, setObjectType] = useState("TABLE");
  const [description, setDescription] = useState("");
  const [columnsText, setColumnsText] = useState("Id | INT | PK | NOT NULL\nName | NVARCHAR(100) | | NULL");
  const [fromObjectId, setFromObjectId] = useState("");
  const [fromColumn, setFromColumn] = useState("");
  const [toObjectId, setToObjectId] = useState("");
  const [toColumn, setToColumn] = useState("");
  const [relationshipType, setRelationshipType] = useState("1:many");
  const [importText, setImportText] = useState("");
  const [message, setMessage] = useState("");
  const [filterText, setFilterText] = useState("");

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(catalog)); }
    catch { setMessage("Browser storage is unavailable; export your catalog JSON to keep a backup."); }
  }, [catalog]);

  const selectedFrom = catalog.tables.find(table => table.id === fromObjectId);
  const selectedTo = catalog.tables.find(table => table.id === toObjectId);
  const visibleTables = useMemo(() => catalog.tables.filter(table =>
    (table.schemaName + "." + table.objectName + " " + table.objectType + " " + table.description).toLowerCase().includes(filterText.toLowerCase())
  ), [catalog.tables, filterText]);
  const panel = { background: C.bg, border: "1px solid " + C.border, borderRadius: 9, padding: 13 };
  const inputStyle = { width: "100%", boxSizing: "border-box", padding: 9, borderRadius: 7, border: "1px solid " + C.border, background: C.surface, color: C.text, fontSize: 12 };
  const labelStyle = { display: "grid", gap: 5, color: C.textMuted, fontSize: 11 };
  const primaryButton = { padding: "9px 12px", border: 0, borderRadius: 7, background: C.accent, color: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 12 };
  const secondaryButton = { padding: "8px 11px", border: "1px solid " + C.border, borderRadius: 7, background: C.surface, color: C.text, cursor: "pointer", fontSize: 12 };

  const addTable = () => {
    if (!identifierPattern.test(schemaName.trim()) || !identifierPattern.test(objectName.trim())) {
      setMessage("Use valid SQL identifiers for schema and table/view names.");
      return;
    }
    if (catalog.tables.some(table => table.schemaName.toLowerCase() === schemaName.trim().toLowerCase() && table.objectName.toLowerCase() === objectName.trim().toLowerCase())) {
      setMessage("This schema object is already registered.");
      return;
    }
    const columns = columnsText.split("\n").map(line => line.trim()).filter(Boolean).map((line, index) => {
      const parts = line.split("|").map(part => part.trim());
      const name = parts[0] || "";
      const dataType = parts[1] || "";
      const flags = (parts.slice(2).join(" ") || "").toUpperCase();
      return {
        name, dataType,
        isPrimaryKey: /\bPK\b|PRIMARY KEY/.test(flags),
        isForeignKey: /\bFK\b|FOREIGN KEY/.test(flags),
        isNullable: !/NOT NULL|\bNN\b/.test(flags)
      };
    });
    if (!columns.length || columns.some(column => !identifierPattern.test(column.name) || !column.dataType)) {
      setMessage("Add at least one valid column. Format: ColumnName | DataType | PK/FK | NULL/NOT NULL.");
      return;
    }
    const nextTable = { id: createId(), schemaName: schemaName.trim(), objectName: objectName.trim(), objectType, description: description.trim(), columns };
    setCatalog(current => ({ ...current, tables: [...current.tables, nextTable] }));
    setObjectName("");
    setDescription("");
    setMessage("Schema object added to your local catalog.");
  };

  const addRelationship = () => {
    if (!selectedFrom || !selectedTo || !fromColumn || !toColumn) {
      setMessage("Select both objects and their relationship columns.");
      return;
    }
    if (selectedFrom.id === selectedTo.id && fromColumn === toColumn) {
      setMessage("A relationship must connect distinct columns.");
      return;
    }
    const exists = catalog.relationships.some(item => item.fromObjectId === fromObjectId && item.fromColumn === fromColumn && item.toObjectId === toObjectId && item.toColumn === toColumn);
    if (exists) { setMessage("This relationship is already registered."); return; }
    setCatalog(current => ({ ...current, relationships: [...current.relationships, { id: createId(), fromObjectId, fromColumn, toObjectId, toColumn, relationshipType }] }));
    setMessage("Relationship added. Confirm its cardinality against the source system.");
  };

  const exportCatalog = () => {
    setImportText(JSON.stringify({ version: 1, ...catalog }, null, 2));
    setMessage("Catalog JSON prepared below. Copy it to keep a backup or transfer it to another browser.");
  };

  const importCatalog = () => {
    try {
      const parsed = normalizeCatalog(JSON.parse(importText));
      setCatalog(parsed);
      setMessage("Catalog imported and saved locally.");
    } catch (error) {
      setMessage("Import failed: " + error.message);
    }
  };

  const objectLabel = table => table.schemaName + "." + table.objectName;
  return (
    <div style={{ display: "grid", gap: 13 }}>
      <div style={panel}>
        <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 14 }}>SQL Server schema catalog</strong>
          <span style={{ marginLeft: "auto", fontSize: 10, color: C.textMuted }}>Local browser storage · Manual metadata</span>
        </div>
        <p style={{ color: C.textMuted, fontSize: 12, lineHeight: 1.6 }}>Create a lightweight data dictionary for approved tables and views. This catalog is stored in this browser only and is not uploaded to a database or server.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
          {[["Objects", catalog.tables.length], ["Columns", catalog.tables.reduce((sum, table) => sum + table.columns.length, 0)], ["Relationships", catalog.relationships.length]].map(([label, value]) => <div key={label} style={{ padding: 10, borderRadius: 8, background: C.surface, border: "1px solid " + C.border }}><div style={{ fontSize: 10, color: C.textMuted }}>{label}</div><strong style={{ fontSize: 20 }}>{value}</strong></div>)}
        </div>
      </div>

      <div style={panel}>
        <strong style={{ fontSize: 13 }}>Register a table or view</strong>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr", gap: 8, marginTop: 10 }}>
          <label style={labelStyle}>Schema<input value={schemaName} onChange={event => setSchemaName(event.target.value)} style={inputStyle} placeholder="dbo" /></label>
          <label style={labelStyle}>Object name<input value={objectName} onChange={event => setObjectName(event.target.value)} style={inputStyle} placeholder="PurchaseOrders" /></label>
          <label style={labelStyle}>Type<select value={objectType} onChange={event => setObjectType(event.target.value)} style={inputStyle}><option value="TABLE">Table</option><option value="VIEW">View</option></select></label>
        </div>
        <label style={{ ...labelStyle, marginTop: 8 }}>Business description<input value={description} onChange={event => setDescription(event.target.value)} style={inputStyle} placeholder="Purchase order header records" /></label>
        <label style={{ ...labelStyle, marginTop: 8 }}>Columns · one per line: ColumnName | DataType | PK/FK | NULL/NOT NULL
          <textarea value={columnsText} onChange={event => setColumnsText(event.target.value)} rows={5} style={{ ...inputStyle, fontFamily: "monospace", lineHeight: 1.5 }} />
        </label>
        <button onClick={addTable} style={{ ...primaryButton, marginTop: 9 }}>+ Add to schema catalog</button>
      </div>

      <div style={panel}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><strong style={{ fontSize: 13 }}>Registered objects</strong><input value={filterText} onChange={event => setFilterText(event.target.value)} placeholder="Search schema, object or description" style={{ ...inputStyle, maxWidth: 260, marginLeft: "auto" }} /></div>
        {visibleTables.length === 0 ? <p style={{ color: C.textMuted, fontSize: 12 }}>No matching objects yet. Register your first table or view above.</p> :
          <div style={{ display: "grid", gap: 9, marginTop: 10 }}>
            {visibleTables.map(table => <div key={table.id} style={{ padding: 11, borderRadius: 8, background: C.surface, border: "1px solid " + C.border }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}><strong style={{ fontSize: 12 }}>{objectLabel(table)}</strong><span style={{ fontSize: 9, padding: "3px 6px", borderRadius: 10, background: C.bg, color: C.textMuted }}>{table.objectType}</span><button onClick={() => { setCatalog(current => ({ tables: current.tables.filter(item => item.id !== table.id), relationships: current.relationships.filter(item => item.fromObjectId !== table.id && item.toObjectId !== table.id) })); setMessage("Object and its relationships removed."); }} style={{ ...secondaryButton, marginLeft: "auto", padding: "4px 8px" }}>Remove</button></div>
              {table.description && <p style={{ color: C.textMuted, fontSize: 11, margin: "5px 0" }}>{table.description}</p>}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                {table.columns.map(column => <span key={column.name} title={column.dataType} style={{ fontSize: 10, border: "1px solid " + C.border, borderRadius: 6, padding: "4px 6px", color: C.textMuted }}>{column.name} <span style={{ opacity: .7 }}>· {column.dataType}</span>{column.isPrimaryKey ? " 🔑" : ""}{column.isForeignKey ? " ↗" : ""}</span>)}
              </div>
            </div>)}
          </div>}
      </div>

      <div style={panel}>
        <strong style={{ fontSize: 13 }}>Define relationships</strong>
        <p style={{ color: C.textMuted, fontSize: 11, lineHeight: 1.5 }}>Record only relationships confirmed from approved documentation or source metadata. Cardinality is descriptive; it is not automatically verified.</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <label style={labelStyle}>From object<select value={fromObjectId} onChange={event => { setFromObjectId(event.target.value); setFromColumn(""); }} style={inputStyle}><option value="">Select object</option>{catalog.tables.map(table => <option key={table.id} value={table.id}>{objectLabel(table)}</option>)}</select></label>
          <label style={labelStyle}>From column<select value={fromColumn} onChange={event => setFromColumn(event.target.value)} style={inputStyle}><option value="">Select column</option>{(selectedFrom?.columns || []).map(column => <option key={column.name} value={column.name}>{column.name}</option>)}</select></label>
          <label style={labelStyle}>To object<select value={toObjectId} onChange={event => { setToObjectId(event.target.value); setToColumn(""); }} style={inputStyle}><option value="">Select object</option>{catalog.tables.map(table => <option key={table.id} value={table.id}>{objectLabel(table)}</option>)}</select></label>
          <label style={labelStyle}>To column<select value={toColumn} onChange={event => setToColumn(event.target.value)} style={inputStyle}><option value="">Select column</option>{(selectedTo?.columns || []).map(column => <option key={column.name} value={column.name}>{column.name}</option>)}</select></label>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "end", marginTop: 8, flexWrap: "wrap" }}>
          <label style={{ ...labelStyle, width: 150 }}>Cardinality<select value={relationshipType} onChange={event => setRelationshipType(event.target.value)} style={inputStyle}><option>1:1</option><option>1:many</option><option>many:1</option><option>many:many</option></select></label>
          <button onClick={addRelationship} style={primaryButton}>+ Add relationship</button>
        </div>
        {catalog.relationships.length > 0 && <div style={{ display: "grid", gap: 6, marginTop: 10 }}>{catalog.relationships.map(item => {
          const from = catalog.tables.find(table => table.id === item.fromObjectId);
          const to = catalog.tables.find(table => table.id === item.toObjectId);
          return <div key={item.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: 8, borderRadius: 7, background: C.surface, fontSize: 11 }}><span>{from ? objectLabel(from) : "?"}.{item.fromColumn}</span><strong style={{ color: C.accent }}>→ {item.relationshipType} →</strong><span>{to ? objectLabel(to) : "?"}.{item.toColumn}</span><button onClick={() => setCatalog(current => ({ ...current, relationships: current.relationships.filter(row => row.id !== item.id) }))} style={{ ...secondaryButton, marginLeft: "auto", padding: "3px 7px" }}>×</button></div>;
        })}</div>}
      </div>

      <div style={panel}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><strong style={{ fontSize: 13 }}>Import / export catalog</strong><button onClick={exportCatalog} style={{ ...secondaryButton, marginLeft: "auto" }}>Prepare JSON export</button></div>
        <textarea value={importText} onChange={event => setImportText(event.target.value)} rows={7} placeholder="Paste a previously exported schema catalog JSON here, or prepare an export..." style={{ ...inputStyle, marginTop: 9, fontFamily: "monospace", fontSize: 11 }} />
        <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}><button onClick={importCatalog} style={primaryButton}>Validate and import JSON</button><button onClick={() => { setImportText(""); setMessage(""); }} style={secondaryButton}>Clear JSON</button></div>
        {message && <p role="status" style={{ color: C.textMuted, fontSize: 11, lineHeight: 1.5, marginBottom: 0 }}>{message}</p>}
      </div>

      <div style={{ ...panel, borderStyle: "dashed" }}>
        <strong style={{ fontSize: 12 }}>Data handling and safety</strong>
        <p style={{ color: C.textMuted, fontSize: 11, lineHeight: 1.7, margin: "5px 0 0" }}>Catalog data is stored in this browser's local storage. It is not synchronized across devices and may be cleared by browser data policies. Export regular JSON backups. Do not enter credentials, personal data or confidential production values. This version does not connect to SQL Server, inspect live metadata or execute queries.</p>
      </div>
    </div>
  );
}
