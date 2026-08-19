//! WebAssembly boundary for the designer engine.
//!
//! Everything that mutates the document, computes geometry or produces markup
//! lives on this side of the bridge. The JavaScript layer owns nothing but
//! pixels and pointer events.

mod compiler;
mod engine;
mod node;

use engine::{Document, Engine, Rect};
use node::{LayoutMode, NodeKind};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console, js_name = error)]
    fn console_error(message: &str);
}

/// Routes Rust panics to the browser console instead of an opaque
/// `unreachable executed` trap. Installed once by [`create_engine`].
fn install_panic_hook() {
    use std::sync::Once;
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        std::panic::set_hook(Box::new(|info| {
            console_error(&format!("[designer_engine] panic: {}", info));
        }));
    });
}

fn to_js_error(message: String) -> JsValue {
    JsValue::from_str(&message)
}

/// The handle JavaScript holds for the whole session.
#[wasm_bindgen]
pub struct DesignerEngine {
    inner: Engine,
}

#[wasm_bindgen]
impl DesignerEngine {
    #[wasm_bindgen(constructor)]
    pub fn new() -> DesignerEngine {
        install_panic_hook();
        DesignerEngine {
            inner: Engine::new(),
        }
    }

    // ----------------------------------------------------------- structure

    /// Creates a node of `kind` inside `parent_id` at the given parent-local
    /// coordinates. Returns the new node id.
    #[wasm_bindgen(js_name = addElement)]
    pub fn add_element(
        &mut self,
        kind: &str,
        parent_id: Option<String>,
        x: f64,
        y: f64,
    ) -> Result<String, JsValue> {
        let kind = NodeKind::parse(kind)
            .ok_or_else(|| to_js_error(format!("unknown element kind `{}`", kind)))?;
        self.inner
            .add(kind, parent_id.as_deref(), x, y)
            .map_err(to_js_error)
    }

    #[wasm_bindgen(js_name = deleteElement)]
    pub fn delete_element(&mut self, id: &str) -> Result<(), JsValue> {
        self.inner.delete(id).map_err(to_js_error)
    }

    #[wasm_bindgen(js_name = duplicateElement)]
    pub fn duplicate_element(&mut self, id: &str) -> Result<String, JsValue> {
        self.inner.duplicate(id).map_err(to_js_error)
    }

    /// Moves `id` into `parent_id`. `index` is optional; `-1` appends.
    #[wasm_bindgen(js_name = reparentElement)]
    pub fn reparent_element(
        &mut self,
        id: &str,
        parent_id: &str,
        index: i32,
    ) -> Result<(), JsValue> {
        let position = if index < 0 {
            None
        } else {
            Some(index as usize)
        };
        self.inner.checkpoint();
        match self.inner.reparent(id, parent_id, position) {
            Ok(()) => Ok(()),
            Err(message) => {
                // Roll the checkpoint back so a rejected move leaves no undo step.
                self.inner.discard_checkpoint();
                Err(to_js_error(message))
            }
        }
    }

    /// `delta` of `-1` sends the node backwards, `1` brings it forwards.
    #[wasm_bindgen(js_name = reorderElement)]
    pub fn reorder_element(&mut self, id: &str, delta: i32) -> Result<(), JsValue> {
        self.inner.checkpoint();
        match self.inner.reorder(id, delta) {
            Ok(()) => Ok(()),
            Err(message) => {
                self.inner.discard_checkpoint();
                Err(to_js_error(message))
            }
        }
    }

    // ------------------------------------------------------------ mutation

    /// Drag fast path: no history, no allocation beyond the id lookup.
    #[wasm_bindgen(js_name = moveElement)]
    pub fn move_element(&mut self, id: &str, x: f64, y: f64) -> Result<(), JsValue> {
        self.inner.move_to(id, x, y).map_err(to_js_error)
    }

    /// Resize fast path: no history.
    #[wasm_bindgen(js_name = resizeElement)]
    pub fn resize_element(&mut self, id: &str, width: f64, height: f64) -> Result<(), JsValue> {
        self.inner.resize(id, width, height).map_err(to_js_error)
    }

    /// Applies one property and records an undo step.
    #[wasm_bindgen(js_name = updateElement)]
    pub fn update_element(&mut self, id: &str, key: &str, value: &str) -> Result<(), JsValue> {
        self.inner.checkpoint();
        match self.inner.set_prop(id, key, value) {
            Ok(()) => Ok(()),
            Err(message) => {
                self.inner.discard_checkpoint();
                Err(to_js_error(message))
            }
        }
    }

    /// Applies one property without recording history — for slider/colour
    /// drags where the caller has already taken a checkpoint.
    #[wasm_bindgen(js_name = updateElementLive)]
    pub fn update_element_live(&mut self, id: &str, key: &str, value: &str) -> Result<(), JsValue> {
        self.inner.set_prop(id, key, value).map_err(to_js_error)
    }

    #[wasm_bindgen(js_name = updatePage)]
    pub fn update_page(&mut self, key: &str, value: &str) -> Result<(), JsValue> {
        self.inner.checkpoint();
        match self.inner.set_page_prop(key, value) {
            Ok(()) => Ok(()),
            Err(message) => {
                self.inner.discard_checkpoint();
                Err(to_js_error(message))
            }
        }
    }

    /// Opens a history entry before a multi-step gesture.
    #[wasm_bindgen(js_name = checkpoint)]
    pub fn checkpoint(&mut self) {
        self.inner.checkpoint();
    }

    #[wasm_bindgen(js_name = undo)]
    pub fn undo(&mut self) -> bool {
        self.inner.undo()
    }

    #[wasm_bindgen(js_name = redo)]
    pub fn redo(&mut self) -> bool {
        self.inner.redo()
    }

    /// Empties the undo/redo stacks. Call after loading a document.
    #[wasm_bindgen(js_name = clearHistory)]
    pub fn clear_history(&mut self) {
        self.inner.clear_history();
    }

    #[wasm_bindgen(js_name = canUndo)]
    pub fn can_undo(&self) -> bool {
        self.inner.can_undo()
    }

    #[wasm_bindgen(js_name = canRedo)]
    pub fn can_redo(&self) -> bool {
        self.inner.can_redo()
    }

    // ----------------------------------------------------------- selection

    #[wasm_bindgen(js_name = select)]
    pub fn select(&mut self, id: Option<String>) {
        self.inner.select(id.as_deref());
    }

    #[wasm_bindgen(js_name = selection)]
    pub fn selection(&self) -> Option<String> {
        self.inner.selection().map(String::from)
    }

    // ------------------------------------------------------------ geometry

    /// Ingests the measured boxes reported by the preview frame.
    /// Expected shape: `{"root":[x,y,w,h], "n1":[x,y,w,h], ...}`.
    #[wasm_bindgen(js_name = syncRects)]
    pub fn sync_rects(&mut self, json: &str) -> Result<(), JsValue> {
        let parsed: serde_json::Value = serde_json::from_str(json)
            .map_err(|error| to_js_error(format!("rect payload is not valid JSON: {}", error)))?;
        let map = parsed
            .as_object()
            .ok_or_else(|| to_js_error(String::from("rect payload must be an object")))?;

        let mut rects: HashMap<String, Rect> = HashMap::with_capacity(map.len());
        for (id, value) in map {
            let numbers = match value.as_array() {
                Some(array) if array.len() >= 4 => array,
                _ => continue,
            };
            let read = |index: usize| numbers[index].as_f64().unwrap_or(0.0);
            rects.insert(
                id.clone(),
                Rect {
                    x: read(0),
                    y: read(1),
                    w: read(2),
                    h: read(3),
                },
            );
        }
        self.inner.sync_rects(rects);
        Ok(())
    }

    /// Deepest node under a point, in preview-frame coordinates.
    #[wasm_bindgen(js_name = hitTest)]
    pub fn hit_test(&self, x: f64, y: f64) -> Option<String> {
        self.inner.hit_test(x, y)
    }

    /// Deepest container that may receive a drop at a point.
    #[wasm_bindgen(js_name = dropTarget)]
    pub fn drop_target(&self, x: f64, y: f64, exclude: Option<String>) -> String {
        self.inner.drop_target(x, y, exclude.as_deref())
    }

    /// Converts frame coordinates into coordinates local to a parent's box.
    /// Returns `[x, y]` as JSON to keep the bridge allocation-free of tuples.
    #[wasm_bindgen(js_name = toLocalPoint)]
    pub fn to_local_point(&self, parent_id: &str, x: f64, y: f64) -> String {
        let (local_x, local_y) = self.inner.to_local(parent_id, x, y);
        format!("[{},{}]", node::num(local_x), node::num(local_y))
    }

    /// Measured box of a node as `[x, y, w, h]`, or `null` if unmeasured.
    #[wasm_bindgen(js_name = rectOf)]
    pub fn rect_of(&self, id: &str) -> Option<String> {
        self.inner.rect(id).map(|rect| {
            format!(
                "[{},{},{},{}]",
                node::num(rect.x),
                node::num(rect.y),
                node::num(rect.w),
                node::num(rect.h)
            )
        })
    }

    /// Snap candidates for a dragged node: the edges and centres of its
    /// siblings, returned as `{"v":[...],"h":[...]}` in parent-local space.
    #[wasm_bindgen(js_name = snapGuides)]
    pub fn snap_guides(&self, id: &str) -> String {
        let mut vertical: Vec<f64> = Vec::new();
        let mut horizontal: Vec<f64> = Vec::new();

        if let Some(node) = self.inner.node(id) {
            let parent_id = node
                .parent
                .clone()
                .unwrap_or_else(|| String::from(self.inner.root_id()));
            if let Some(parent) = self.inner.node(&parent_id) {
                for sibling_id in &parent.children {
                    if sibling_id.as_str() == id {
                        continue;
                    }
                    if let Some(sibling) = self.inner.node(sibling_id) {
                        if sibling.hidden {
                            continue;
                        }
                        vertical.push(sibling.x);
                        vertical.push(sibling.x + sibling.width * 0.5);
                        vertical.push(sibling.x + sibling.width);
                        horizontal.push(sibling.y);
                        horizontal.push(sibling.y + sibling.height * 0.5);
                        horizontal.push(sibling.y + sibling.height);
                    }
                }
                vertical.push(0.0);
                vertical.push(parent.width * 0.5);
                vertical.push(parent.width);
                horizontal.push(0.0);
            }
        }

        let join = |values: &[f64]| {
            values
                .iter()
                .map(|value| node::num(*value))
                .collect::<Vec<String>>()
                .join(",")
        };
        format!("{{\"v\":[{}],\"h\":[{}]}}", join(&vertical), join(&horizontal))
    }

    // -------------------------------------------------------------- reads

    /// Full JSON for one node, for the property inspector.
    #[wasm_bindgen(js_name = getElement)]
    pub fn get_element(&self, id: &str) -> Result<String, JsValue> {
        let node = self
            .inner
            .node(id)
            .ok_or_else(|| to_js_error(format!("no node with id `{}`", id)))?;
        serde_json::to_string(node)
            .map_err(|error| to_js_error(format!("failed to serialise node: {}", error)))
    }

    /// Page settings as JSON.
    #[wasm_bindgen(js_name = getPage)]
    pub fn get_page(&self) -> Result<String, JsValue> {
        serde_json::to_string(self.inner.page())
            .map_err(|error| to_js_error(format!("failed to serialise page: {}", error)))
    }

    /// Nested outline for the layers panel:
    /// `{"id","name","kind","hidden","locked","children":[...]}`.
    #[wasm_bindgen(js_name = getTree)]
    pub fn get_tree(&self) -> String {
        let mut out = String::with_capacity(1024);
        write_tree(&self.inner, self.inner.root_id(), &mut out);
        out
    }

    #[wasm_bindgen(js_name = nodeCount)]
    pub fn node_count(&self) -> usize {
        self.inner.node_count()
    }

    // ----------------------------------------------------------- compilers

    #[wasm_bindgen(js_name = compileHtml)]
    pub fn compile_html(&self) -> String {
        compiler::compile_html(&self.inner)
    }

    #[wasm_bindgen(js_name = compileCss)]
    pub fn compile_css(&self) -> String {
        compiler::compile_css(&self.inner)
    }

    /// Editor payload: full document plus the measurement runtime. This is the
    /// string assigned to the preview iframe's `srcdoc`.
    #[wasm_bindgen(js_name = compilePreview)]
    pub fn compile_preview(&self) -> String {
        compiler::compile_document(&self.inner, true)
    }

    /// Shippable payload: identical markup, zero runtime.
    #[wasm_bindgen(js_name = compileExport)]
    pub fn compile_export(&self) -> String {
        compiler::compile_document(&self.inner, false)
    }

    /// Inline declarations for one node, used by the live-patch drag path.
    #[wasm_bindgen(js_name = nodeCss)]
    pub fn node_css(&self, id: &str) -> Result<String, JsValue> {
        let node = self
            .inner
            .node(id)
            .ok_or_else(|| to_js_error(format!("no node with id `{}`", id)))?;
        Ok(compiler::declarations_for(&self.inner, node))
    }

    // --------------------------------------------------------- persistence

    #[wasm_bindgen(js_name = exportProject)]
    pub fn export_project(&self) -> Result<String, JsValue> {
        serde_json::to_string(self.inner.export_document())
            .map_err(|error| to_js_error(format!("failed to serialise project: {}", error)))
    }

    #[wasm_bindgen(js_name = importProject)]
    pub fn import_project(&mut self, json: &str) -> Result<(), JsValue> {
        let document: Document = serde_json::from_str(json)
            .map_err(|error| to_js_error(format!("project file is not valid: {}", error)))?;
        self.inner.import_document(document).map_err(to_js_error)
    }

    /// Clears the document back to an empty page, in one undo step.
    #[wasm_bindgen(js_name = resetProject)]
    pub fn reset_project(&mut self) {
        self.inner.clear();
    }

    /// Convenience used by the starter template: create a node and set several
    /// properties in one bridge crossing. `props` is a flat JSON object.
    #[wasm_bindgen(js_name = addElementWith)]
    pub fn add_element_with(
        &mut self,
        kind: &str,
        parent_id: Option<String>,
        x: f64,
        y: f64,
        props: &str,
    ) -> Result<String, JsValue> {
        let id = self.add_element(kind, parent_id, x, y)?;
        let parsed: serde_json::Value = serde_json::from_str(props)
            .map_err(|error| to_js_error(format!("props is not valid JSON: {}", error)))?;
        if let Some(map) = parsed.as_object() {
            for (key, value) in map {
                let text = match value {
                    serde_json::Value::String(text) => text.clone(),
                    serde_json::Value::Number(number) => number.to_string(),
                    serde_json::Value::Bool(flag) => flag.to_string(),
                    serde_json::Value::Null => String::new(),
                    other => other.to_string(),
                };
                self.inner
                    .set_prop(&id, key, &text)
                    .map_err(|message| to_js_error(format!("`{}`: {}", key, message)))?;
            }
        }
        Ok(id)
    }
}

impl Default for DesignerEngine {
    fn default() -> DesignerEngine {
        DesignerEngine::new()
    }
}

/// Factory kept separate from the constructor so the JS bridge has one obvious
/// entry point after `await init()`.
#[wasm_bindgen(js_name = createEngine)]
pub fn create_engine() -> DesignerEngine {
    DesignerEngine::new()
}

/// Every element kind the toolbox may offer, as JSON.
#[wasm_bindgen(js_name = availableKinds)]
pub fn available_kinds() -> String {
    const KINDS: [NodeKind; 10] = [
        NodeKind::Section,
        NodeKind::Container,
        NodeKind::Stack,
        NodeKind::Heading,
        NodeKind::Text,
        NodeKind::Button,
        NodeKind::Link,
        NodeKind::Image,
        NodeKind::Input,
        NodeKind::Divider,
    ];
    let entries: Vec<String> = KINDS
        .iter()
        .map(|kind| {
            format!(
                "{{\"kind\":\"{}\",\"label\":\"{}\",\"container\":{}}}",
                kind.as_str(),
                kind.label(),
                kind.accepts_children()
            )
        })
        .collect();
    format!("[{}]", entries.join(","))
}

/// Layout modes a container can use, as JSON.
#[wasm_bindgen(js_name = availableLayouts)]
pub fn available_layouts() -> String {
    const MODES: [LayoutMode; 3] = [LayoutMode::Absolute, LayoutMode::Row, LayoutMode::Column];
    let entries: Vec<String> = MODES
        .iter()
        .map(|mode| format!("\"{}\"", mode.as_str()))
        .collect();
    format!("[{}]", entries.join(","))
}

/// Serialises the layer outline by hand.
///
/// The tree is written straight into one buffer rather than built as an
/// intermediate `serde_json::Value`, because the layers panel re-reads it on
/// every structural change.
fn write_tree(engine: &Engine, id: &str, out: &mut String) {
    let node = match engine.node(id) {
        Some(node) => node,
        None => {
            out.push_str("null");
            return;
        }
    };
    out.push_str("{\"id\":\"");
    out.push_str(&json_escape(&node.id));
    out.push_str("\",\"name\":\"");
    out.push_str(&json_escape(&node.name));
    out.push_str("\",\"kind\":\"");
    out.push_str(node.kind.as_str());
    out.push_str("\",\"layout\":\"");
    out.push_str(node.layout.as_str());
    out.push_str("\",\"hidden\":");
    out.push_str(if node.hidden { "true" } else { "false" });
    out.push_str(",\"locked\":");
    out.push_str(if node.locked { "true" } else { "false" });
    out.push_str(",\"container\":");
    out.push_str(if node.kind.accepts_children() {
        "true"
    } else {
        "false"
    });
    out.push_str(",\"children\":[");
    for (index, child) in node.children.iter().enumerate() {
        if index > 0 {
            out.push(',');
        }
        write_tree(engine, child, out);
    }
    out.push_str("]}");
}

/// Minimal JSON string escaping for the hand-rolled tree serialiser.
fn json_escape(input: &str) -> String {
    let mut out = String::with_capacity(input.len() + 8);
    for character in input.chars() {
        match character {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => {
                out.push_str(&format!("\\u{:04x}", c as u32));
            }
            c => out.push(c),
        }
    }
    out
}
