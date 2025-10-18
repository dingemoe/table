import DynamicTable from "./DynamicTable.js";
const app = {
        ready(callback) {
            document.addEventListener("DOMContentLoaded", () => {
                callback();
            });
        },
        ui(data = null) {
          let prop = {
            id: {
              import: "import_json",
              feedback: "json_feedback",
              table: "data_table"
            },
            set: {},
            state: { ok: false }
          }
          prop.set.import = document.getElementById(prop.id.import)
          prop.set.feedback = document.getElementById(prop.id.feedback)
          prop.set.table = document.getElementById(prop.id.table)
          prop.state.ok = Object.values(prop.set).filter(Boolean).length === 3

          return prop.state.ok == true ? {
            help: prop,
            import: document.getElementById(prop.id.import),
            feedback: document.getElementById(prop.id.feedback),
            table: data ? new DynamicTable(prop.id.table, data, {
                editableMode: "input",
                tableAttr: () => ({ class: "min-w-full divide-y divide-gray-300" }),
                theadAttr: () => ({ class: "bg-gray-200 text-gray-700" }),
                tbodyAttr: () => ({ class: "bg-white" }),
                trAttr: () => ({ class: "hover:bg-gray-50" }),
                thAttr: (key) => ({ class: "px-4 py-2 text-left font-semibold text-sm", "data-key": key }),
                tdAttr: (key, val) => ({ class: "px-4 py-2 text-sm text-gray-800", "data-key": key }),
                inputAttr: (key, val) => ({
                class: "w-full text-sm px-2",
                style: "background:none; border:none; outline:none;",
                "data-key": key
                })
            }): null
          } : prop
        }
    }
    export default app;