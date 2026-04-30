import { Header } from './header.js';
import { Footer } from './footer.js';

// Wraps a page node with header + footer. Pages return their own DOM,
// the router calls Layout(pageNode) to mount the full shell.
export function Layout(pageNode) {
  const el = document.createElement('div');
  el.className = 'min-h-screen flex flex-col';
  const main = document.createElement('main');
  main.className = 'flex-1';
  main.appendChild(pageNode);
  el.append(Header(), main, Footer());
  return el;
}
