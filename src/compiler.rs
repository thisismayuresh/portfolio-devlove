//! Compiles the AST into an optimised HTML/CSS payload.
//!
//! Two output flavours share one code path:
//!   * *editor* documents carry a small measurement runtime and are injected
//!     into the sandboxed preview iframe through `srcdoc`;
//!   * *export* documents are pure, runtime-free HTML the user can ship.

use crate::engine::Engine;
use crate::node::{px, LayoutMode, NodeKind, WebNode};
use std::fmt::Write as FmtWrite;

/// Escapes text destined for an element body.
pub fn escape_html(input: &str) -> String {
    let mut out = String::with_capacity(input.len() + 16);
    for character in input.chars() {
        match character {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            _ => out.push(character),
        }
    }
    out
}

/// Escapes text destined for a double-quoted attribute value.
pub fn escape_attr(input: &str) -> String {
    let mut out = String::with_capacity(input.len() + 16);
    for character in input.chars() {
        match character {
            '&' => out.push_str("&amp;"),
            '<' => out.push_str("&lt;"),
            '>' => out.push_str("&gt;"),
            '"' => out.push_str("&quot;"),
            '\'' => out.push_str("&#39;"),
            _ => out.push(character),
        }
    }
    out
}

/// Escapes body text and turns newlines into hard breaks.
fn escape_rich_text(input: &str) -> String {
    escape_html(input).replace('\n', "<br>")
}

/// Builds the declaration list for a single node, including the geometry the
/// node's position mode implies. Shared by the stylesheet compiler and by the
/// live-patch path so a dragged element and a recompiled document agree.
pub fn declarations_for(engine: &Engine, node: &WebNode) -> String {
    let mut out = String::with_capacity(192);

    if node.kind == NodeKind::Root {
        let page = engine.page();
        let _ = write!(
            out,
            "position:relative;margin:0 auto;box-sizing:border-box;width:{};min-height:{};",
            px(page.width),
            px(page.min_height)
        );
        node.style.write_declarations(&mut out);
        return out;
    }

    let flowed = engine.parent_layout(node).is_flow();
    if flowed {
        out.push_str("position:relative;");
    } else {
        let _ = write!(
            out,
            "position:absolute;left:{};top:{};",
            px(node.x),
            px(node.y)
        );
    }

    let _ = write!(out, "width:{};", px(node.width));
    if node.auto_height {
        out.push_str("height:auto;");
        if !flowed {
            let _ = write!(out, "min-height:{};", px(node.height));
        }
    } else {
        let _ = write!(out, "height:{};", px(node.height));
    }

    if flowed {
        out.push_str("flex:0 0 auto;");
    }

    match node.layout {
        LayoutMode::Row => out.push_str("display:flex;flex-direction:row;align-items:flex-start;"),
        LayoutMode::Column => {
            out.push_str("display:flex;flex-direction:column;align-items:stretch;")
        }
        LayoutMode::Absolute => {}
    }

    if node.hidden {
        out.push_str("display:none;");
    }

    node.style.write_declarations(&mut out);
    out
}

/// Emits the full stylesheet for the document.
pub fn compile_css(engine: &Engine) -> String {
    let page = engine.page();
    let mut css = String::with_capacity(2048);

    css.push_str("*,*::before,*::after{box-sizing:border-box}");
    css.push_str("html{-webkit-text-size-adjust:100%}");
    let _ = write!(
        css,
        "body{{margin:0;padding:0;font-family:{};background:{};}}",
        crate::node::sanitize_value(&page.font_family),
        crate::node::sanitize_value(&page.background)
    );
    let _ = write!(
        css,
        "html{{background:{};}}",
        crate::node::sanitize_value(&page.background)
    );
    css.push_str("img{display:block;max-width:100%}");
    css.push_str("button,input{font:inherit;color:inherit}");
    css.push_str("button{cursor:pointer}");
    css.push_str("a{text-decoration:none}");
    css.push_str("hr{border:0;margin:0}");
    css.push_str("p,h1,h2,h3,h4,h5,h6{margin:0}");

    let mut stack = vec![String::from(engine.root_id())];
    while let Some(id) = stack.pop() {
        let node = match engine.node(&id) {
            Some(node) => node,
            None => continue,
        };
        let declarations = declarations_for(engine, node);
        if !declarations.is_empty() {
            let _ = write!(css, ".el-{}{{{}}}", escape_class(&node.id), declarations);
        }
        for child in node.children.iter().rev() {
            stack.push(child.clone());
        }
    }
    css
}

/// Class names are derived from ids, which the engine controls, but the import
/// path can carry hand-written ids — keep the selector safe regardless.
fn escape_class(id: &str) -> String {
    id.chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect()
}

/// Emits the `<body>` markup for the document.
pub fn compile_html(engine: &Engine) -> String {
    let mut html = String::with_capacity(4096);
    write_node(engine, engine.root_id(), &mut html);
    html
}

fn write_node(engine: &Engine, id: &str, out: &mut String) {
    let node = match engine.node(id) {
        Some(node) => node,
        None => return,
    };

    let tag = node.kind.tag();
    let class = escape_class(&node.id);
    let _ = write!(out, "<{} class=\"el-{}\" data-nid=\"{}\"", tag, class, escape_attr(&node.id));

    match node.kind {
        NodeKind::Image => {
            let src = node.src.as_deref().unwrap_or(crate::node::PLACEHOLDER_IMAGE);
            let _ = write!(out, " src=\"{}\"", escape_attr(src));
            let _ = write!(out, " alt=\"{}\"", escape_attr(&node.content));
            out.push_str(" loading=\"lazy\" decoding=\"async\"");
        }
        NodeKind::Input => {
            let _ = write!(out, " type=\"text\"");
            if let Some(placeholder) = &node.placeholder {
                let _ = write!(out, " placeholder=\"{}\"", escape_attr(placeholder));
            }
            if !node.content.is_empty() {
                let _ = write!(out, " value=\"{}\"", escape_attr(&node.content));
            }
        }
        NodeKind::Link => {
            let href = node.href.as_deref().unwrap_or("#");
            let _ = write!(out, " href=\"{}\"", escape_attr(href));
        }
        NodeKind::Button => out.push_str(" type=\"button\""),
        _ => {}
    }
    out.push('>');

    if node.kind.is_void() {
        // Void elements: no children, no closing tag.
        return;
    }

    if node.kind.has_text() && !node.content.is_empty() {
        out.push_str(&escape_rich_text(&node.content));
    }
    for child in &node.children {
        write_node(engine, child, out);
    }
    let _ = write!(out, "</{}>", tag);
}

/// Assembles a complete HTML document.
///
/// `editor` toggles the measurement runtime and the editor-only affordances
/// (empty-container hinting, disabled text selection).
pub fn compile_document(engine: &Engine, editor: bool) -> String {
    let page = engine.page();
    let mut doc = String::with_capacity(8192);
    doc.push_str("<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\">");
    doc.push_str("<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">");
    let _ = write!(doc, "<title>{}</title>", escape_html(&page.title));
    doc.push_str("<style>");
    doc.push_str(&compile_css(engine));
    if editor {
        doc.push_str(EDITOR_CHROME_CSS);
    }
    doc.push_str("</style></head>");
    doc.push_str(&compile_html(engine));
    if editor {
        doc.push_str("<script>");
        doc.push_str(RUNTIME_JS);
        doc.push_str("</script>");
    }
    doc.push_str("</html>");
    doc
}

/// Editor-only styling injected into the preview frame. Never exported.
const EDITOR_CHROME_CSS: &str = concat!(
    "body{cursor:default;-webkit-user-select:none;user-select:none;}",
    "[data-nid]{outline-offset:-1px}",
    "div[data-nid]:empty,section[data-nid]:empty{outline:1px dashed rgba(120,140,180,.55)}",
    "a[data-nid]{pointer-events:none}",
    "button[data-nid],input[data-nid]{pointer-events:none}"
);

/// The measurement runtime that lives inside the sandboxed preview frame.
///
/// It owns three jobs and nothing else:
///   1. report every node's box to the host on a rAF-coalesced schedule,
///   2. apply single-node style patches during drag/resize without a reload,
///   3. relay wheel scrolling forwarded by the host overlay.
///
/// The frame runs with `sandbox="allow-scripts"`, so it has an opaque origin
/// and cannot reach into the host document — messaging is the only channel.
pub const RUNTIME_JS: &str = r##"(function(){
  "use strict";
  var CHANNEL = "tb-frame";
  function post(message){
    try { message.source = CHANNEL; parent.postMessage(message, "*"); }
    catch (error) { /* host went away; nothing to do */ }
  }
  var pending = 0;
  function measure(){
    if (pending) { return; }
    pending = requestAnimationFrame(function(){
      pending = 0;
      var rects = Object.create(null);
      var nodes = document.querySelectorAll("[data-nid]");
      for (var i = 0; i < nodes.length; i++) {
        var box = nodes[i].getBoundingClientRect();
        rects[nodes[i].getAttribute("data-nid")] = [box.left, box.top, box.width, box.height];
      }
      post({
        type: "rects",
        rects: rects,
        viewport: [window.innerWidth, window.innerHeight],
        scroll: [window.pageXOffset, window.pageYOffset],
        scrollHeight: document.documentElement.scrollHeight
      });
    });
  }
  function find(id){
    if (typeof id !== "string" || !id) { return null; }
    var nodes = document.querySelectorAll("[data-nid]");
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].getAttribute("data-nid") === id) { return nodes[i]; }
    }
    return null;
  }
  window.addEventListener("message", function(event){
    var data = event.data;
    if (!data || data.target !== CHANNEL) { return; }
    if (data.type === "patch") {
      var target = find(data.id);
      if (target) { target.style.cssText = typeof data.css === "string" ? data.css : ""; }
      measure();
    } else if (data.type === "text") {
      var host = find(data.id);
      if (host) { host.textContent = typeof data.text === "string" ? data.text : ""; }
      measure();
    } else if (data.type === "scrollBy") {
      window.scrollBy(Number(data.dx) || 0, Number(data.dy) || 0);
      measure();
    } else if (data.type === "measure") {
      measure();
    }
  });
  window.addEventListener("resize", measure);
  window.addEventListener("scroll", measure, true);
  window.addEventListener("load", measure);
  var images = document.images;
  for (var i = 0; i < images.length; i++) {
    images[i].addEventListener("load", measure);
    images[i].addEventListener("error", measure);
  }
  if (document.fonts && typeof document.fonts.ready === "object") {
    document.fonts.ready.then(measure).catch(function(){});
  }
  if (typeof MutationObserver === "function") {
    new MutationObserver(measure).observe(document.documentElement, {
      subtree: true, childList: true, attributes: true, characterData: true
    });
  }
  post({ type: "ready" });
  measure();
})();"##;
