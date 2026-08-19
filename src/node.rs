//! Data model for the designer AST.
//!
//! Every element the user drops onto the canvas is one [`WebNode`]. Nodes are
//! stored in a flat arena inside the engine and linked together through
//! `parent` / `children` id references, which keeps mutations O(1) and avoids
//! deep recursive borrows during drag gestures.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fmt::Write as FmtWrite;

/// Renders an `f64` with at most two decimals and no trailing `.0`.
pub fn num(value: f64) -> String {
    if !value.is_finite() {
        return String::from("0");
    }
    let rounded = (value * 100.0).round() / 100.0;
    let text = format!("{}", rounded);
    if text == "-0" {
        String::from("0")
    } else {
        text
    }
}

/// Renders an `f64` as a CSS pixel length.
pub fn px(value: f64) -> String {
    let mut text = num(value);
    text.push_str("px");
    text
}

/// Parses a user supplied string into a bounded `f64`.
pub fn parse_num(raw: &str) -> Option<f64> {
    let value: f64 = raw.trim().parse().ok()?;
    if value.is_finite() {
        Some(value.clamp(-1_000_000.0, 1_000_000.0))
    } else {
        None
    }
}

/// Parses a user supplied string into a boolean.
pub fn parse_bool(raw: &str) -> bool {
    matches!(
        raw.trim().to_ascii_lowercase().as_str(),
        "1" | "true" | "yes" | "on"
    )
}

/// The primitive kinds a page can be built from.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum NodeKind {
    Root,
    Container,
    Section,
    Stack,
    Heading,
    Text,
    Button,
    Link,
    Image,
    Input,
    Divider,
}

impl NodeKind {
    pub fn parse(raw: &str) -> Option<NodeKind> {
        match raw.trim().to_ascii_lowercase().as_str() {
            "root" => Some(NodeKind::Root),
            "container" | "div" | "box" => Some(NodeKind::Container),
            "section" => Some(NodeKind::Section),
            "stack" | "flex" => Some(NodeKind::Stack),
            "heading" | "h2" | "title" => Some(NodeKind::Heading),
            "text" | "paragraph" | "p" => Some(NodeKind::Text),
            "button" => Some(NodeKind::Button),
            "link" | "a" => Some(NodeKind::Link),
            "image" | "img" => Some(NodeKind::Image),
            "input" | "field" => Some(NodeKind::Input),
            "divider" | "hr" | "rule" => Some(NodeKind::Divider),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            NodeKind::Root => "root",
            NodeKind::Container => "container",
            NodeKind::Section => "section",
            NodeKind::Stack => "stack",
            NodeKind::Heading => "heading",
            NodeKind::Text => "text",
            NodeKind::Button => "button",
            NodeKind::Link => "link",
            NodeKind::Image => "image",
            NodeKind::Input => "input",
            NodeKind::Divider => "divider",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            NodeKind::Root => "Page",
            NodeKind::Container => "Container",
            NodeKind::Section => "Section",
            NodeKind::Stack => "Stack",
            NodeKind::Heading => "Heading",
            NodeKind::Text => "Text",
            NodeKind::Button => "Button",
            NodeKind::Link => "Link",
            NodeKind::Image => "Image",
            NodeKind::Input => "Input",
            NodeKind::Divider => "Divider",
        }
    }

    /// The HTML tag emitted for this kind.
    pub fn tag(self) -> &'static str {
        match self {
            NodeKind::Root => "body",
            NodeKind::Container | NodeKind::Stack => "div",
            NodeKind::Section => "section",
            NodeKind::Heading => "h2",
            NodeKind::Text => "p",
            NodeKind::Button => "button",
            NodeKind::Link => "a",
            NodeKind::Image => "img",
            NodeKind::Input => "input",
            NodeKind::Divider => "hr",
        }
    }

    /// Void elements never receive a closing tag or children.
    pub fn is_void(self) -> bool {
        matches!(self, NodeKind::Image | NodeKind::Input | NodeKind::Divider)
    }

    /// Whether the drop router may nest other nodes inside this kind.
    pub fn accepts_children(self) -> bool {
        matches!(
            self,
            NodeKind::Root | NodeKind::Container | NodeKind::Section | NodeKind::Stack
        )
    }

    /// Whether the node renders editable inline text.
    pub fn has_text(self) -> bool {
        matches!(
            self,
            NodeKind::Heading | NodeKind::Text | NodeKind::Button | NodeKind::Link
        )
    }

    pub fn default_size(self) -> (f64, f64) {
        match self {
            NodeKind::Root => (1280.0, 800.0),
            NodeKind::Container => (360.0, 240.0),
            NodeKind::Section => (960.0, 420.0),
            NodeKind::Stack => (320.0, 200.0),
            NodeKind::Heading => (420.0, 52.0),
            NodeKind::Text => (360.0, 72.0),
            NodeKind::Button => (168.0, 46.0),
            NodeKind::Link => (140.0, 24.0),
            NodeKind::Image => (280.0, 190.0),
            NodeKind::Input => (280.0, 44.0),
            NodeKind::Divider => (360.0, 2.0),
        }
    }

    pub fn default_content(self) -> &'static str {
        match self {
            NodeKind::Heading => "Your headline goes here",
            NodeKind::Text => "Double-click on the canvas to edit this paragraph. It wraps like normal flowing text.",
            NodeKind::Button => "Get started",
            NodeKind::Link => "Learn more",
            NodeKind::Input => "",
            _ => "",
        }
    }

    pub fn default_style(self) -> Style {
        let mut style = Style::default();
        match self {
            NodeKind::Root => {
                style.background = Some(String::from("#ffffff"));
                style.color = Some(String::from("#0f1729"));
            }
            NodeKind::Container => {
                style.background = Some(String::from("#f3f5f9"));
                style.radius = Some(14.0);
                style.padding = Some(20.0);
                style.border_width = Some(1.0);
                style.border_color = Some(String::from("#dfe4ec"));
            }
            NodeKind::Section => {
                style.background = Some(String::from("#0f1729"));
                style.color = Some(String::from("#ffffff"));
                style.padding = Some(48.0);
            }
            NodeKind::Stack => {
                style.background = Some(String::from("transparent"));
                style.gap = Some(16.0);
                style.padding = Some(12.0);
            }
            NodeKind::Heading => {
                style.font_size = Some(36.0);
                style.font_weight = Some(String::from("700"));
                style.color = Some(String::from("#0f1729"));
            }
            NodeKind::Text => {
                style.font_size = Some(16.0);
                style.color = Some(String::from("#41506b"));
                style.line_height = Some(1.6);
            }
            NodeKind::Button => {
                style.background = Some(String::from("#3f5bff"));
                style.color = Some(String::from("#ffffff"));
                style.radius = Some(10.0);
                style.font_size = Some(15.0);
                style.font_weight = Some(String::from("600"));
                style.border_width = Some(0.0);
            }
            NodeKind::Link => {
                style.color = Some(String::from("#3f5bff"));
                style.font_size = Some(15.0);
            }
            NodeKind::Image => {
                style.radius = Some(12.0);
                style.custom
                    .insert(String::from("object-fit"), String::from("cover"));
            }
            NodeKind::Input => {
                style.background = Some(String::from("#ffffff"));
                style.color = Some(String::from("#0f1729"));
                style.radius = Some(10.0);
                style.padding = Some(12.0);
                style.border_width = Some(1.0);
                style.border_color = Some(String::from("#cbd3e1"));
                style.font_size = Some(15.0);
            }
            NodeKind::Divider => {
                style.background = Some(String::from("#dfe4ec"));
                style.border_width = Some(0.0);
            }
        }
        style
    }
}

/// How a container arranges its children.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LayoutMode {
    /// Children are free-positioned with `left` / `top` (Figma style).
    Absolute,
    /// Children flow horizontally.
    Row,
    /// Children flow vertically.
    Column,
}

impl LayoutMode {
    pub fn parse(raw: &str) -> Option<LayoutMode> {
        match raw.trim().to_ascii_lowercase().as_str() {
            "absolute" | "free" => Some(LayoutMode::Absolute),
            "row" | "horizontal" => Some(LayoutMode::Row),
            "column" | "vertical" => Some(LayoutMode::Column),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            LayoutMode::Absolute => "absolute",
            LayoutMode::Row => "row",
            LayoutMode::Column => "column",
        }
    }

    pub fn is_flow(self) -> bool {
        !matches!(self, LayoutMode::Absolute)
    }
}

/// Inline style bag. Well known properties are typed; anything else lands in
/// `custom` so the builder never blocks the user from writing raw CSS.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Style {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub background: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_size: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_weight: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_family: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub line_height: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub letter_spacing: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text_align: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub padding: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub radius: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_width: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub border_color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub opacity: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gap: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub shadow: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub overflow: Option<String>,
    #[serde(default)]
    pub custom: BTreeMap<String, String>,
}

impl Style {
    /// Appends every declaration this bag owns to `out`.
    ///
    /// `custom` is a `BTreeMap` so the emitted order is stable across calls,
    /// which keeps the compiled payload byte-identical when nothing changed.
    pub fn write_declarations(&self, out: &mut String) {
        if let Some(value) = &self.background {
            let _ = write!(out, "background:{};", sanitize_value(value));
        }
        if let Some(value) = &self.color {
            let _ = write!(out, "color:{};", sanitize_value(value));
        }
        if let Some(value) = self.font_size {
            let _ = write!(out, "font-size:{};", px(value));
        }
        if let Some(value) = &self.font_weight {
            let _ = write!(out, "font-weight:{};", sanitize_value(value));
        }
        if let Some(value) = &self.font_family {
            let _ = write!(out, "font-family:{};", sanitize_value(value));
        }
        if let Some(value) = self.line_height {
            let _ = write!(out, "line-height:{};", num(value));
        }
        if let Some(value) = self.letter_spacing {
            let _ = write!(out, "letter-spacing:{};", px(value));
        }
        if let Some(value) = &self.text_align {
            let _ = write!(out, "text-align:{};", sanitize_value(value));
        }
        if let Some(value) = self.padding {
            let _ = write!(out, "padding:{};", px(value));
        }
        if let Some(value) = self.radius {
            let _ = write!(out, "border-radius:{};", px(value));
        }
        match (self.border_width, &self.border_color) {
            (Some(width), color) if width > 0.0 => {
                let ink = color
                    .as_deref()
                    .map(sanitize_value)
                    .unwrap_or_else(|| String::from("#000000"));
                let _ = write!(out, "border:{} solid {};", px(width), ink);
            }
            (Some(_), _) => out.push_str("border:0;"),
            (None, _) => {}
        }
        if let Some(value) = self.opacity {
            let _ = write!(out, "opacity:{};", num(value.clamp(0.0, 1.0)));
        }
        if let Some(value) = self.gap {
            let _ = write!(out, "gap:{};", px(value));
        }
        if let Some(value) = &self.shadow {
            let _ = write!(out, "box-shadow:{};", sanitize_value(value));
        }
        if let Some(value) = &self.overflow {
            let _ = write!(out, "overflow:{};", sanitize_value(value));
        }
        for (property, value) in &self.custom {
            let key = sanitize_property(property);
            if key.is_empty() {
                continue;
            }
            let _ = write!(out, "{}:{};", key, sanitize_value(value));
        }
    }

    /// Applies one style key. An empty value clears the property.
    pub fn set(&mut self, key: &str, value: &str) -> Result<(), String> {
        let trimmed = value.trim();
        let empty = trimmed.is_empty();
        match key {
            "background" => self.background = none_if(empty, trimmed),
            "color" => self.color = none_if(empty, trimmed),
            "fontWeight" | "font_weight" => self.font_weight = none_if(empty, trimmed),
            "fontFamily" | "font_family" => self.font_family = none_if(empty, trimmed),
            "textAlign" | "text_align" => self.text_align = none_if(empty, trimmed),
            "borderColor" | "border_color" => self.border_color = none_if(empty, trimmed),
            "shadow" => self.shadow = none_if(empty, trimmed),
            "overflow" => self.overflow = none_if(empty, trimmed),
            "fontSize" | "font_size" => self.font_size = num_or_clear(empty, trimmed, key)?,
            "lineHeight" | "line_height" => self.line_height = num_or_clear(empty, trimmed, key)?,
            "letterSpacing" | "letter_spacing" => {
                self.letter_spacing = num_or_clear(empty, trimmed, key)?
            }
            "padding" => self.padding = num_or_clear(empty, trimmed, key)?,
            "radius" => self.radius = num_or_clear(empty, trimmed, key)?,
            "borderWidth" | "border_width" => self.border_width = num_or_clear(empty, trimmed, key)?,
            "opacity" => self.opacity = num_or_clear(empty, trimmed, key)?,
            "gap" => self.gap = num_or_clear(empty, trimmed, key)?,
            other => {
                return Err(format!("unknown style property `{}`", other));
            }
        }
        Ok(())
    }
}

fn none_if(empty: bool, value: &str) -> Option<String> {
    if empty {
        None
    } else {
        Some(String::from(value))
    }
}

fn num_or_clear(empty: bool, value: &str, key: &str) -> Result<Option<f64>, String> {
    if empty {
        return Ok(None);
    }
    parse_num(value)
        .map(Some)
        .ok_or_else(|| format!("`{}` expects a number, received `{}`", key, value))
}

/// Strips characters that could break out of a declaration block.
pub fn sanitize_value(raw: &str) -> String {
    raw.chars()
        .filter(|c| *c != ';' && *c != '{' && *c != '}' && *c != '<' && *c != '>')
        .collect::<String>()
        .trim()
        .to_string()
}

/// Keeps only characters legal in a CSS property name.
pub fn sanitize_property(raw: &str) -> String {
    raw.trim()
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-')
        .collect()
}

/// A single element of the page tree.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct WebNode {
    pub id: String,
    pub kind: NodeKind,
    pub name: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    /// When true the compiler emits `height:auto` and lets content size the box.
    pub auto_height: bool,
    pub content: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub href: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub src: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub placeholder: Option<String>,
    pub layout: LayoutMode,
    pub locked: bool,
    pub hidden: bool,
    pub style: Style,
    pub children: Vec<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub parent: Option<String>,
}

impl WebNode {
    pub fn new(id: String, kind: NodeKind, x: f64, y: f64) -> WebNode {
        let (width, height) = kind.default_size();
        WebNode {
            name: String::from(kind.label()),
            id,
            kind,
            x,
            y,
            width,
            height,
            auto_height: matches!(kind, NodeKind::Text | NodeKind::Heading),
            content: String::from(kind.default_content()),
            href: if kind == NodeKind::Link {
                Some(String::from("#"))
            } else {
                None
            },
            src: if kind == NodeKind::Image {
                Some(String::from(PLACEHOLDER_IMAGE))
            } else {
                None
            },
            placeholder: if kind == NodeKind::Input {
                Some(String::from("Type here…"))
            } else {
                None
            },
            layout: LayoutMode::Absolute,
            locked: false,
            hidden: false,
            style: kind.default_style(),
            children: Vec::new(),
            parent: None,
        }
    }

    /// Applies one property by dotted key. Supported prefixes:
    /// bare geometry/content keys, `style.*`, and `custom.*`.
    pub fn set_prop(&mut self, key: &str, value: &str) -> Result<(), String> {
        if let Some(style_key) = key.strip_prefix("style.") {
            return self.style.set(style_key, value);
        }
        if let Some(custom_key) = key.strip_prefix("custom.") {
            let property = sanitize_property(custom_key);
            if property.is_empty() {
                return Err(String::from("custom property name is empty"));
            }
            if value.trim().is_empty() {
                self.style.custom.remove(&property);
            } else {
                self.style
                    .custom
                    .insert(property, String::from(value.trim()));
            }
            return Ok(());
        }

        let trimmed = value.trim();
        match key {
            "x" => self.x = parse_num(trimmed).ok_or_else(|| bad_number("x", trimmed))?,
            "y" => self.y = parse_num(trimmed).ok_or_else(|| bad_number("y", trimmed))?,
            "width" => {
                let raw = parse_num(trimmed).ok_or_else(|| bad_number("width", trimmed))?;
                self.width = raw.max(MIN_SIZE);
            }
            "height" => {
                let raw = parse_num(trimmed).ok_or_else(|| bad_number("height", trimmed))?;
                self.height = raw.max(MIN_SIZE);
            }
            "content" => self.content = String::from(value),
            "name" => {
                self.name = if trimmed.is_empty() {
                    String::from(self.kind.label())
                } else {
                    String::from(trimmed)
                }
            }
            "href" => self.href = none_if(trimmed.is_empty(), trimmed),
            "src" => self.src = none_if(trimmed.is_empty(), trimmed),
            "placeholder" => self.placeholder = none_if(trimmed.is_empty(), trimmed),
            "layout" => {
                self.layout = LayoutMode::parse(trimmed)
                    .ok_or_else(|| format!("unknown layout mode `{}`", trimmed))?
            }
            "autoHeight" | "auto_height" => self.auto_height = parse_bool(trimmed),
            "locked" => self.locked = parse_bool(trimmed),
            "hidden" => self.hidden = parse_bool(trimmed),
            other => return Err(format!("unknown property `{}`", other)),
        }
        Ok(())
    }
}

fn bad_number(key: &str, value: &str) -> String {
    format!("`{}` expects a number, received `{}`", key, value)
}

/// Smallest allowed box edge, in CSS pixels.
pub const MIN_SIZE: f64 = 4.0;

/// Inline SVG placeholder so a dropped image never renders as a broken icon
/// and no network request is made.
pub const PLACEHOLDER_IMAGE: &str = "data:image/svg+xml;utf8,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='320'%20height='220'%3E%3Crect%20width='100%25'%20height='100%25'%20fill='%23e3e8f0'/%3E%3Cpath%20d='M0%20220%20L110%20105%20L180%20170%20L235%20125%20L320%20220%20Z'%20fill='%23a8b3c5'/%3E%3Ccircle%20cx='236'%20cy='58'%20r='26'%20fill='%23a8b3c5'/%3E%3C/svg%3E";
