//! The mutable document store: tree operations, hit testing and history.

use crate::node::{parse_num, LayoutMode, NodeKind, WebNode, MIN_SIZE};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};

/// Maximum number of undo steps retained in memory.
const HISTORY_LIMIT: usize = 200;

/// A measured box reported by the preview frame, in frame-viewport pixels.
#[derive(Clone, Copy, Debug, Default, Serialize, Deserialize)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

impl Rect {
    pub fn contains(&self, x: f64, y: f64) -> bool {
        x >= self.x && x <= self.x + self.w && y >= self.y && y <= self.y + self.h
    }

    pub fn area(&self) -> f64 {
        (self.w * self.h).abs()
    }
}

/// Document-wide settings that live outside the node tree.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PageSettings {
    pub width: f64,
    pub min_height: f64,
    pub background: String,
    pub font_family: String,
    pub title: String,
}

impl Default for PageSettings {
    fn default() -> PageSettings {
        PageSettings {
            width: 1280.0,
            min_height: 860.0,
            background: String::from("#ffffff"),
            font_family: String::from(
                "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
            ),
            title: String::from("Untitled page"),
        }
    }
}

/// The serialisable half of the engine. Snapshots for undo/redo and the
/// project export both use this shape.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Document {
    pub version: u32,
    pub root: String,
    pub counter: u64,
    pub page: PageSettings,
    pub nodes: HashMap<String, WebNode>,
}

/// The live document plus transient editor state.
pub struct Engine {
    doc: Document,
    selection: Option<String>,
    rects: HashMap<String, Rect>,
    undo_stack: Vec<Document>,
    redo_stack: Vec<Document>,
}

impl Engine {
    pub fn new() -> Engine {
        let root_id = String::from("root");
        let mut root = WebNode::new(root_id.clone(), NodeKind::Root, 0.0, 0.0);
        root.name = String::from("Page");
        let page = PageSettings::default();
        root.width = page.width;
        root.height = page.min_height;

        let mut nodes = HashMap::new();
        nodes.insert(root_id.clone(), root);

        Engine {
            doc: Document {
                version: 1,
                root: root_id,
                counter: 0,
                page,
                nodes,
            },
            selection: None,
            rects: HashMap::new(),
            undo_stack: Vec::new(),
            redo_stack: Vec::new(),
        }
    }

    // ---------------------------------------------------------------- reads

    pub fn root_id(&self) -> &str {
        &self.doc.root
    }

    pub fn page(&self) -> &PageSettings {
        &self.doc.page
    }

    pub fn node(&self, id: &str) -> Option<&WebNode> {
        self.doc.nodes.get(id)
    }

    pub fn selection(&self) -> Option<&str> {
        self.selection.as_deref()
    }

    pub fn node_count(&self) -> usize {
        self.doc.nodes.len()
    }

    pub fn can_undo(&self) -> bool {
        !self.undo_stack.is_empty()
    }

    pub fn can_redo(&self) -> bool {
        !self.redo_stack.is_empty()
    }

    /// Layout mode of `id`'s parent, defaulting to absolute for the root.
    pub fn parent_layout(&self, node: &WebNode) -> LayoutMode {
        node.parent
            .as_ref()
            .and_then(|pid| self.doc.nodes.get(pid))
            .map(|parent| parent.layout)
            .unwrap_or(LayoutMode::Absolute)
    }

    // ------------------------------------------------------------- history

    /// Captures the current document so the next mutation can be undone.
    pub fn checkpoint(&mut self) {
        self.undo_stack.push(self.doc.clone());
        if self.undo_stack.len() > HISTORY_LIMIT {
            self.undo_stack.remove(0);
        }
        self.redo_stack.clear();
    }

    /// Drops all history. Called once a document has finished loading so the
    /// user cannot undo their way back past the start of the session.
    pub fn clear_history(&mut self) {
        self.undo_stack.clear();
        self.redo_stack.clear();
    }

    /// Throws away the most recent checkpoint without touching the document
    /// or the redo stack. Used when a guarded mutation turned out to fail, so
    /// a rejected action leaves no empty step in the history.
    pub fn discard_checkpoint(&mut self) {
        self.undo_stack.pop();
    }

    pub fn undo(&mut self) -> bool {
        match self.undo_stack.pop() {
            Some(previous) => {
                self.redo_stack.push(self.doc.clone());
                self.doc = previous;
                self.validate_selection();
                true
            }
            None => false,
        }
    }

    pub fn redo(&mut self) -> bool {
        match self.redo_stack.pop() {
            Some(next) => {
                self.undo_stack.push(self.doc.clone());
                self.doc = next;
                self.validate_selection();
                true
            }
            None => false,
        }
    }

    fn validate_selection(&mut self) {
        if let Some(id) = &self.selection {
            if !self.doc.nodes.contains_key(id) {
                self.selection = None;
            }
        }
    }

    // ------------------------------------------------------------ mutations

    fn next_id(&mut self) -> String {
        loop {
            self.doc.counter = self.doc.counter.wrapping_add(1);
            let candidate = format!("n{}", self.doc.counter);
            if !self.doc.nodes.contains_key(&candidate) {
                return candidate;
            }
        }
    }

    /// Inserts a new node of `kind` under `parent_id` (root when `None`).
    /// Returns the id of the created node.
    pub fn add(
        &mut self,
        kind: NodeKind,
        parent_id: Option<&str>,
        x: f64,
        y: f64,
    ) -> Result<String, String> {
        if kind == NodeKind::Root {
            return Err(String::from("the root node cannot be created twice"));
        }
        let parent_id = self.resolve_container(parent_id)?;
        let id = self.next_id();
        let mut node = WebNode::new(id.clone(), kind, x, y);
        node.parent = Some(parent_id.clone());

        self.checkpoint();
        self.doc.nodes.insert(id.clone(), node);
        if let Some(parent) = self.doc.nodes.get_mut(&parent_id) {
            parent.children.push(id.clone());
        }
        self.selection = Some(id.clone());
        Ok(id)
    }

    /// Falls back to the root when the requested parent is missing or is not
    /// allowed to hold children.
    fn resolve_container(&self, requested: Option<&str>) -> Result<String, String> {
        match requested {
            Some(id) => match self.doc.nodes.get(id) {
                Some(node) if node.kind.accepts_children() => Ok(node.id.clone()),
                Some(node) => Ok(node
                    .parent
                    .clone()
                    .unwrap_or_else(|| self.doc.root.clone())),
                None => Ok(self.doc.root.clone()),
            },
            None => Ok(self.doc.root.clone()),
        }
    }

    pub fn delete(&mut self, id: &str) -> Result<(), String> {
        if id == self.doc.root {
            return Err(String::from("the root node cannot be deleted"));
        }
        if !self.doc.nodes.contains_key(id) {
            return Err(format!("no node with id `{}`", id));
        }
        self.checkpoint();
        self.remove_subtree(id);
        Ok(())
    }

    /// Empties the page in a single undo step.
    pub fn clear(&mut self) {
        self.checkpoint();
        let children = self
            .doc
            .nodes
            .get(&self.doc.root)
            .map(|root| root.children.clone())
            .unwrap_or_default();
        for child in children {
            self.remove_subtree(&child);
        }
        self.selection = None;
    }

    /// Detaches `id` from its parent and drops it with every descendant.
    /// Records no history — callers decide where the undo boundary is.
    fn remove_subtree(&mut self, id: &str) {
        let parent_id = self.doc.nodes.get(id).and_then(|node| node.parent.clone());
        if let Some(parent_id) = parent_id {
            if let Some(parent) = self.doc.nodes.get_mut(&parent_id) {
                parent.children.retain(|child| child.as_str() != id);
            }
        }
        for doomed in self.collect_subtree(id) {
            self.doc.nodes.remove(&doomed);
            self.rects.remove(&doomed);
        }
        self.validate_selection();
    }

    /// Depth-first list of `id` and every descendant.
    pub fn collect_subtree(&self, id: &str) -> Vec<String> {
        let mut out = Vec::new();
        let mut stack = vec![String::from(id)];
        while let Some(current) = stack.pop() {
            if let Some(node) = self.doc.nodes.get(&current) {
                for child in node.children.iter().rev() {
                    stack.push(child.clone());
                }
            }
            out.push(current);
        }
        out
    }

    /// Fast path used during drag gestures. Does not record history.
    pub fn move_to(&mut self, id: &str, x: f64, y: f64) -> Result<(), String> {
        let node = self
            .doc
            .nodes
            .get_mut(id)
            .ok_or_else(|| format!("no node with id `{}`", id))?;
        if node.locked {
            return Ok(());
        }
        if x.is_finite() {
            node.x = x;
        }
        if y.is_finite() {
            node.y = y;
        }
        Ok(())
    }

    /// Fast path used during resize gestures. Does not record history.
    pub fn resize(&mut self, id: &str, width: f64, height: f64) -> Result<(), String> {
        let node = self
            .doc
            .nodes
            .get_mut(id)
            .ok_or_else(|| format!("no node with id `{}`", id))?;
        if node.locked {
            return Ok(());
        }
        if width.is_finite() {
            node.width = width.max(MIN_SIZE);
        }
        if height.is_finite() {
            node.height = height.max(MIN_SIZE);
            node.auto_height = false;
        }
        Ok(())
    }

    pub fn set_prop(&mut self, id: &str, key: &str, value: &str) -> Result<(), String> {
        let node = self
            .doc
            .nodes
            .get_mut(id)
            .ok_or_else(|| format!("no node with id `{}`", id))?;
        node.set_prop(key, value)
    }

    pub fn set_page_prop(&mut self, key: &str, value: &str) -> Result<(), String> {
        let trimmed = value.trim();
        match key {
            "width" => {
                let width = parse_num(trimmed)
                    .ok_or_else(|| format!("`width` expects a number, received `{}`", trimmed))?;
                self.doc.page.width = width.clamp(240.0, 6000.0);
            }
            "minHeight" | "min_height" => {
                let height = parse_num(trimmed).ok_or_else(|| {
                    format!("`minHeight` expects a number, received `{}`", trimmed)
                })?;
                self.doc.page.min_height = height.clamp(240.0, 40000.0);
            }
            "background" => self.doc.page.background = String::from(trimmed),
            "fontFamily" | "font_family" => {
                if !trimmed.is_empty() {
                    self.doc.page.font_family = String::from(trimmed);
                }
            }
            "title" => {
                self.doc.page.title = if trimmed.is_empty() {
                    String::from("Untitled page")
                } else {
                    String::from(trimmed)
                }
            }
            other => return Err(format!("unknown page property `{}`", other)),
        }
        Ok(())
    }

    /// Moves `id` under `new_parent` at `index` (appended when out of range).
    pub fn reparent(&mut self, id: &str, new_parent: &str, index: Option<usize>) -> Result<(), String> {
        if id == self.doc.root {
            return Err(String::from("the root node cannot be reparented"));
        }
        if !self.doc.nodes.contains_key(id) {
            return Err(format!("no node with id `{}`", id));
        }
        if !self.doc.nodes.contains_key(new_parent) {
            return Err(format!("no node with id `{}`", new_parent));
        }
        if self
            .collect_subtree(id)
            .iter()
            .any(|node| node.as_str() == new_parent)
        {
            return Err(String::from("cannot move a node inside its own subtree"));
        }
        if !self
            .doc
            .nodes
            .get(new_parent)
            .map(|parent| parent.kind.accepts_children())
            .unwrap_or(false)
        {
            return Err(format!("`{}` cannot hold children", new_parent));
        }

        let old_parent = self.doc.nodes.get(id).and_then(|node| node.parent.clone());
        if old_parent.as_deref() == Some(new_parent) {
            // Pure reorder inside the same parent.
            if let Some(parent) = self.doc.nodes.get_mut(new_parent) {
                parent.children.retain(|child| child.as_str() != id);
                let position = index.unwrap_or(parent.children.len()).min(parent.children.len());
                parent.children.insert(position, String::from(id));
            }
            return Ok(());
        }

        if let Some(old_parent) = old_parent {
            if let Some(parent) = self.doc.nodes.get_mut(&old_parent) {
                parent.children.retain(|child| child.as_str() != id);
            }
        }
        if let Some(parent) = self.doc.nodes.get_mut(new_parent) {
            let position = index.unwrap_or(parent.children.len()).min(parent.children.len());
            parent.children.insert(position, String::from(id));
        }
        if let Some(node) = self.doc.nodes.get_mut(id) {
            node.parent = Some(String::from(new_parent));
        }
        Ok(())
    }

    /// Deep-clones a subtree next to the original. Returns the new root id.
    pub fn duplicate(&mut self, id: &str) -> Result<String, String> {
        if id == self.doc.root {
            return Err(String::from("the root node cannot be duplicated"));
        }
        let source = self
            .doc
            .nodes
            .get(id)
            .cloned()
            .ok_or_else(|| format!("no node with id `{}`", id))?;
        let parent_id = source
            .parent
            .clone()
            .unwrap_or_else(|| self.doc.root.clone());

        self.checkpoint();
        let clone_id = self.clone_subtree(id, Some(parent_id.clone()))?;
        if let Some(clone) = self.doc.nodes.get_mut(&clone_id) {
            clone.x += 24.0;
            clone.y += 24.0;
        }
        if let Some(parent) = self.doc.nodes.get_mut(&parent_id) {
            let position = parent
                .children
                .iter()
                .position(|child| child.as_str() == id)
                .map(|index| index + 1)
                .unwrap_or(parent.children.len());
            parent.children.insert(position, clone_id.clone());
        }
        self.selection = Some(clone_id.clone());
        Ok(clone_id)
    }

    /// Recursively copies `id` and its descendants into fresh ids. The clone is
    /// inserted into the arena but is *not* linked into `parent`'s child list;
    /// the caller decides the insertion index.
    fn clone_subtree(&mut self, id: &str, parent: Option<String>) -> Result<String, String> {
        let source = self
            .doc
            .nodes
            .get(id)
            .cloned()
            .ok_or_else(|| format!("no node with id `{}`", id))?;
        let new_id = self.next_id();
        let mut copy = source.clone();
        copy.id = new_id.clone();
        copy.parent = parent;
        copy.children = Vec::new();
        self.doc.nodes.insert(new_id.clone(), copy);

        let mut cloned_children = Vec::with_capacity(source.children.len());
        for child in &source.children {
            let child_clone = self.clone_subtree(child, Some(new_id.clone()))?;
            cloned_children.push(child_clone);
        }
        if let Some(node) = self.doc.nodes.get_mut(&new_id) {
            node.children = cloned_children;
        }
        Ok(new_id)
    }

    /// Raises or lowers a node within its parent's child list.
    pub fn reorder(&mut self, id: &str, delta: i32) -> Result<(), String> {
        let parent_id = self
            .doc
            .nodes
            .get(id)
            .and_then(|node| node.parent.clone())
            .ok_or_else(|| format!("`{}` has no parent", id))?;
        let parent = self
            .doc
            .nodes
            .get_mut(&parent_id)
            .ok_or_else(|| format!("no node with id `{}`", parent_id))?;
        let current = parent
            .children
            .iter()
            .position(|child| child == id)
            .ok_or_else(|| format!("`{}` is not a child of `{}`", id, parent_id))?;
        let target = (current as i32 + delta).clamp(0, parent.children.len() as i32 - 1) as usize;
        if target == current {
            return Ok(());
        }
        let moved = parent.children.remove(current);
        parent.children.insert(target, moved);
        Ok(())
    }

    pub fn select(&mut self, id: Option<&str>) {
        self.selection = match id {
            Some(id) if self.doc.nodes.contains_key(id) => Some(String::from(id)),
            _ => None,
        };
    }

    // ------------------------------------------------------------- geometry

    /// Replaces the measured-rect cache reported by the preview frame.
    pub fn sync_rects(&mut self, rects: HashMap<String, Rect>) {
        self.rects = rects;
    }

    pub fn rect(&self, id: &str) -> Option<Rect> {
        self.rects.get(id).copied()
    }

    /// Deepest visible node containing the point. Children are tested in
    /// reverse document order so the visually topmost sibling wins.
    pub fn hit_test(&self, x: f64, y: f64) -> Option<String> {
        let root = self.doc.nodes.get(&self.doc.root)?;
        let mut best: Option<String> = None;
        self.descend_hit(root, x, y, &mut best);
        best
    }

    fn descend_hit(&self, node: &WebNode, x: f64, y: f64, best: &mut Option<String>) {
        if node.hidden {
            return;
        }
        let inside = match self.rects.get(&node.id) {
            Some(rect) => rect.contains(x, y),
            None => node.id == self.doc.root,
        };
        if !inside {
            return;
        }
        if node.id != self.doc.root {
            *best = Some(node.id.clone());
        }
        for child_id in node.children.iter().rev() {
            let before = best.clone();
            if let Some(child) = self.doc.nodes.get(child_id) {
                self.descend_hit(child, x, y, best);
            }
            if *best != before {
                return;
            }
        }
    }

    /// Deepest container that can accept a drop at the given point, skipping
    /// anything inside `exclude`'s subtree.
    pub fn drop_target(&self, x: f64, y: f64, exclude: Option<&str>) -> String {
        let banned: HashSet<String> = exclude
            .map(|id| self.collect_subtree(id).into_iter().collect())
            .unwrap_or_default();

        let mut best = self.doc.root.clone();
        let mut best_area = f64::INFINITY;
        for (id, node) in &self.doc.nodes {
            if node.hidden || banned.contains(id) || !node.kind.accepts_children() {
                continue;
            }
            if id == &self.doc.root {
                continue;
            }
            if let Some(rect) = self.rects.get(id) {
                if rect.contains(x, y) && rect.area() < best_area {
                    best_area = rect.area();
                    best = id.clone();
                }
            }
        }
        best
    }

    /// Converts frame-viewport coordinates into coordinates local to
    /// `parent_id`'s padding box, which is what `left`/`top` are relative to.
    pub fn to_local(&self, parent_id: &str, x: f64, y: f64) -> (f64, f64) {
        let border = self
            .doc
            .nodes
            .get(parent_id)
            .and_then(|node| node.style.border_width)
            .unwrap_or(0.0);
        match self.rects.get(parent_id) {
            Some(rect) => (x - rect.x - border, y - rect.y - border),
            None => (x, y),
        }
    }

    // ------------------------------------------------------ persistence

    pub fn export_document(&self) -> &Document {
        &self.doc
    }

    /// Replaces the whole document, repairing any broken parent links so a
    /// hand-edited or truncated project file can still be opened.
    pub fn import_document(&mut self, mut incoming: Document) -> Result<(), String> {
        if !incoming.nodes.contains_key(&incoming.root) {
            return Err(String::from("project file has no root node"));
        }

        let known: HashSet<String> = incoming.nodes.keys().cloned().collect();
        let root_id = incoming.root.clone();
        for node in incoming.nodes.values_mut() {
            node.children.retain(|child| known.contains(child) && child != &root_id);
            if let Some(parent) = &node.parent {
                if !known.contains(parent) {
                    node.parent = None;
                }
            }
        }

        // Re-link orphans to the root so nothing silently disappears.
        let mut linked: HashSet<String> = HashSet::new();
        linked.insert(root_id.clone());
        let mut stack = vec![root_id.clone()];
        while let Some(current) = stack.pop() {
            if let Some(node) = incoming.nodes.get(&current) {
                for child in node.children.clone() {
                    if linked.insert(child.clone()) {
                        stack.push(child);
                    }
                }
            }
        }
        let orphans: Vec<String> = incoming
            .nodes
            .keys()
            .filter(|id| !linked.contains(*id))
            .cloned()
            .collect();
        for orphan in orphans {
            if let Some(node) = incoming.nodes.get_mut(&orphan) {
                node.parent = Some(root_id.clone());
            }
            if let Some(root) = incoming.nodes.get_mut(&root_id) {
                root.children.push(orphan);
            }
        }

        let highest = incoming
            .nodes
            .keys()
            .filter_map(|id| id.strip_prefix('n').and_then(|rest| rest.parse::<u64>().ok()))
            .max()
            .unwrap_or(0);
        incoming.counter = incoming.counter.max(highest);

        self.checkpoint();
        self.doc = incoming;
        self.rects.clear();
        self.validate_selection();
        Ok(())
    }
}

impl Default for Engine {
    fn default() -> Engine {
        Engine::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::compiler;

    /// Builds a container with one text child. Returns `(parent, child)`.
    fn seeded() -> (Engine, String, String) {
        let mut engine = Engine::new();
        let parent = engine
            .add(NodeKind::Container, None, 40.0, 60.0)
            .expect("container");
        let child = engine
            .add(NodeKind::Text, Some(&parent), 10.0, 10.0)
            .expect("text");
        (engine, parent, child)
    }

    #[test]
    fn new_documents_hold_only_the_root() {
        let engine = Engine::new();
        assert_eq!(engine.node_count(), 1);
        assert!(engine.node(engine.root_id()).is_some());
    }

    #[test]
    fn added_nodes_are_linked_both_ways() {
        let (engine, parent, child) = seeded();
        assert_eq!(engine.node(&child).unwrap().parent.as_deref(), Some(parent.as_str()));
        assert_eq!(engine.node(&parent).unwrap().children, vec![child]);
    }

    #[test]
    fn non_containers_receive_their_parent_instead() {
        let mut engine = Engine::new();
        let text = engine.add(NodeKind::Text, None, 0.0, 0.0).unwrap();
        let button = engine.add(NodeKind::Button, Some(&text), 0.0, 0.0).unwrap();
        // A text node cannot hold children, so the button lands beside it.
        assert_eq!(engine.node(&button).unwrap().parent.as_deref(), Some("root"));
    }

    #[test]
    fn deleting_a_container_removes_its_subtree() {
        let (mut engine, parent, child) = seeded();
        engine.delete(&parent).expect("delete");
        assert!(engine.node(&parent).is_none());
        assert!(engine.node(&child).is_none());
        assert_eq!(engine.node_count(), 1);
    }

    #[test]
    fn the_root_cannot_be_deleted_or_reparented() {
        let (mut engine, parent, _child) = seeded();
        assert!(engine.delete("root").is_err());
        assert!(engine.reparent("root", &parent, None).is_err());
    }

    #[test]
    fn a_node_cannot_be_moved_into_its_own_subtree() {
        let mut engine = Engine::new();
        let outer = engine.add(NodeKind::Container, None, 0.0, 0.0).unwrap();
        let inner = engine
            .add(NodeKind::Container, Some(&outer), 0.0, 0.0)
            .unwrap();
        assert!(engine.reparent(&outer, &inner, None).is_err());
    }

    #[test]
    fn duplicating_copies_the_whole_subtree_with_fresh_ids() {
        let (mut engine, parent, child) = seeded();
        let clone = engine.duplicate(&parent).expect("duplicate");
        assert_ne!(clone, parent);

        let clone_node = engine.node(&clone).unwrap();
        assert_eq!(clone_node.children.len(), 1);
        assert_ne!(clone_node.children[0], child);
        // The copy is offset so it is visible on top of the original.
        assert_eq!(clone_node.x, engine.node(&parent).unwrap().x + 24.0);
    }

    #[test]
    fn undo_restores_the_previous_document() {
        let (mut engine, parent, _child) = seeded();
        let before = engine.node_count();
        engine.delete(&parent).unwrap();
        assert!(engine.undo());
        assert_eq!(engine.node_count(), before);
        assert!(engine.node(&parent).is_some());
    }

    #[test]
    fn redo_reapplies_an_undone_change() {
        let (mut engine, parent, _child) = seeded();
        engine.delete(&parent).unwrap();
        engine.undo();
        assert!(engine.redo());
        assert!(engine.node(&parent).is_none());
    }

    #[test]
    fn drag_fast_paths_do_not_record_history() {
        let (mut engine, parent, _child) = seeded();
        engine.clear_history();
        engine.move_to(&parent, 100.0, 100.0).unwrap();
        engine.resize(&parent, 200.0, 200.0).unwrap();
        assert!(!engine.can_undo());
    }

    #[test]
    fn locked_nodes_ignore_move_and_resize() {
        let (mut engine, parent, _child) = seeded();
        engine.set_prop(&parent, "locked", "true").unwrap();
        engine.move_to(&parent, 999.0, 999.0).unwrap();
        assert_eq!(engine.node(&parent).unwrap().x, 40.0);
    }

    #[test]
    fn hit_testing_prefers_the_deepest_measured_node() {
        let (mut engine, parent, child) = seeded();
        let mut rects = HashMap::new();
        rects.insert(String::from("root"), Rect { x: 0.0, y: 0.0, w: 1280.0, h: 800.0 });
        rects.insert(parent.clone(), Rect { x: 40.0, y: 60.0, w: 360.0, h: 240.0 });
        rects.insert(child.clone(), Rect { x: 50.0, y: 70.0, w: 100.0, h: 40.0 });
        engine.sync_rects(rects);

        assert_eq!(engine.hit_test(60.0, 80.0).as_deref(), Some(child.as_str()));
        assert_eq!(engine.hit_test(300.0, 250.0).as_deref(), Some(parent.as_str()));
        assert_eq!(engine.hit_test(1200.0, 700.0), None);
    }

    #[test]
    fn drop_target_skips_the_dragged_subtree() {
        let (mut engine, parent, child) = seeded();
        let mut rects = HashMap::new();
        rects.insert(parent.clone(), Rect { x: 0.0, y: 0.0, w: 300.0, h: 300.0 });
        rects.insert(child.clone(), Rect { x: 10.0, y: 10.0, w: 100.0, h: 40.0 });
        engine.sync_rects(rects);

        assert_eq!(engine.drop_target(50.0, 50.0, None), parent);
        assert_eq!(engine.drop_target(50.0, 50.0, Some(&parent)), "root");
    }

    #[test]
    fn compiled_markup_escapes_user_content() {
        let mut engine = Engine::new();
        let text = engine.add(NodeKind::Text, None, 0.0, 0.0).unwrap();
        engine
            .set_prop(&text, "content", "<script>alert('x')</script>")
            .unwrap();
        let html = compiler::compile_html(&engine);
        assert!(!html.contains("<script>"));
        assert!(html.contains("&lt;script&gt;"));
    }

    #[test]
    fn compiled_css_is_stable_across_calls() {
        let (engine, _parent, _child) = seeded();
        assert_eq!(compiler::compile_css(&engine), compiler::compile_css(&engine));
    }

    #[test]
    fn export_documents_carry_no_runtime() {
        let (engine, _parent, _child) = seeded();
        let editor = compiler::compile_document(&engine, true);
        let shipped = compiler::compile_document(&engine, false);
        assert!(editor.contains("<script>"));
        assert!(!shipped.contains("<script>"));
    }

    #[test]
    fn import_relinks_orphaned_nodes_to_the_root() {
        let (mut engine, parent, child) = seeded();
        let mut document = engine.export_document().clone();
        // Simulate a corrupted file: the parent forgot about its child.
        document
            .nodes
            .get_mut(&parent)
            .unwrap()
            .children
            .clear();

        engine.import_document(document).expect("import");
        let root = engine.node("root").unwrap();
        assert!(root.children.contains(&child));
    }

    #[test]
    fn rejected_properties_leave_the_node_untouched() {
        let (mut engine, parent, _child) = seeded();
        assert!(engine.set_prop(&parent, "width", "not-a-number").is_err());
        assert_eq!(engine.node(&parent).unwrap().width, 360.0);
    }
}
