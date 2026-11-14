const API_URL = "https://script.google.com/macros/s/AKfycbw13XHijvij69hcrHdBA2oJ800nqMr3dJNzSDHSxPiE0xfHH72sVTO4mS3XNTRqMlQ/exec";

const state = {
  products: [],
  cart: [],
  filters: { equipo: "", tipo: "", genero: "", search: "", soloDestacados: false, orden: "none" },
  currentProduct: null
};

const $ = (sel) => document.querySelector(sel);
const formatCOP = (n) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

function toast(msg, ms = 2500) {
  const el = document.createElement("div"); el.className = "toast"; el.textContent = msg;
  document.body.appendChild(el); setTimeout(() => el.remove(), ms);
}

function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const originalText = btn.textContent;
    btn.textContent = "¡Copiado!";
    btn.style.background = "#22c55e"; btn.style.color = "#fff";
    setTimeout(() => { btn.textContent = originalText; btn.style.background = "#e5e7eb"; btn.style.color = "#111827"; }, 2000);
  }).catch(err => alert("No se pudo copiar: " + text));
}

function saveCart() { localStorage.setItem("urbar_cart", JSON.stringify(state.cart)); }
function loadCart() {
  try { const saved = localStorage.getItem("urbar_cart"); if (saved) state.cart = JSON.parse(saved); } 
  catch (e) { console.error("Error al cargar el carrito", e); }
}

async function getJSON(url) {
  const res = await fetch(url); const json = await res.json();
  if (!json.success) throw new Error(json.error); return json.data;
}

async function postJSON(body) {
  const res = await fetch(API_URL, {
    method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body),
  });
  const json = await res.json(); if (!json.success) throw new Error(json.error); return json.data;
}

async function loadProducts() {
  const grid = $("#productsGrid");
  grid.innerHTML = Array(8).fill('<div class="skeleton-card"></div>').join('');
  try {
    state.products = await getJSON(`${API_URL}?action=getProducts`);
    buildFilterOptions(); renderProducts(); updateCartCount(); updateProductStructuredData(state.products);
    
    // Si el usuario entra directo a una URL de producto, lo abrimos
    const path = window.location.pathname;
    if (path.startsWith('/producto/')) {
      const id = path.split('/')[2];
      if (id) openProductDetail(Number(id), false); // false para que no vuelva a cambiar la URL
    }
  } catch (err) { $("#resultsCount").textContent = "Error al cargar productos"; grid.innerHTML = ''; }
}

function buildFilterOptions() {
  const tipos = [...new Set(state.products.map((p) => p.tipo))].sort();
  const generos = [...new Set(state.products.map((p) => p.genero))].sort();
  const fill = (select, values, label) => {
    select.innerHTML = `<option value="">${label}</option>`;
    values.forEach((v) => { select.innerHTML += `<option value="${v}">${v}</option>`; });
  };
  fill($("#tipoFilter"), tipos, "Todos los tipos"); fill($("#generoFilter"), generos, "Todos los géneros");
}

function filterByEquipo(equipo) {
  state.filters.equipo = equipo;
  document.querySelectorAll('.sub-nav a').forEach(l => l.classList.remove('active'));
  renderProducts();
  document.querySelector('.catalog-header').scrollIntoView({ behavior: 'smooth' });
}

function applyFilters() {
  let list = [...state.products];
  if (state.filters.equipo) list = list.filter(p => p.equipo === state.filters.equipo);
  if (state.filters.tipo) list = list.filter(p => p.tipo === state.filters.tipo);
  if (state.filters.genero) list = list.filter(p => p.genero === state.filters.genero);
  if (state.filters.soloDestacados) list = list.filter(p => p.destacado);
  if (state.filters.search) {
    const q = state.filters.search.toLowerCase();
    list = list.filter(p => p.nombre.toLowerCase().includes(q) || p.equipo.toLowerCase().includes(q));
  }
  if (state.filters.orden === "asc") list.sort((a, b) => a.precio - b.precio);
  if (state.filters.orden === "desc") list.sort((a, b) => b.precio - a.precio);
  return list;
}

function renderProducts() {
  const grid = $("#productsGrid"); const list = applyFilters();
  $("#resultsCount").textContent = `${list.length} producto(s) encontrados`;
  $("#emptyMessage").classList.toggle("hidden", list.length > 0);
  grid.innerHTML = "";
  list.forEach((p, index) => {
    const card = createProductCard(p);
    card.style.animationDelay = `${index * 50}ms`;
    grid.appendChild(card);
  });
}

function createProductCard(product) {
  const card = document.createElement("article"); card.className = "product-card";
  const sinStock = product.stock <= 0; const tallaInicial = product.tallas[0] || "";

  card.addEventListener('click', (e) => {
    if(e.target.classList.contains('talla-btn') || e.target.classList.contains('add-btn')) return;
    openProductDetail(product.id, true);
  });

  card.innerHTML = `
    <div class="product-image-wrap">
      <img src="${product.imagen}" alt="${product.nombre} - ${product.equipo}" loading="lazy" />
      ${product.destacado ? '<span class="badge badge-destacado">⭐</span>' : ""}
      ${sinStock ? '<span class="badge badge-agotado">Agotado</span>' : ""}
    </div>
    <div class="product-body">
      <p class="product-meta">${product.equipo} · ${product.tipo}</p>
      <h3 class="product-name">${product.nombre || "Sin nombre"}</h3>
      <p class="product-price">${formatCOP(product.precio)}</p>
      <div class="tallas"></div>
      <button class="add-btn" ${sinStock ? "disabled" : ""}>${sinStock ? "Agotado" : "Agregar al carrito"}</button>
    </div>
  `;

  const tallasWrap = card.querySelector(".tallas"); let tallaSeleccionada = tallaInicial;
  product.tallas.forEach((t) => {
    const btn = document.createElement("button"); btn.className = "talla-btn" + (t === tallaInicial ? " selected" : "");
    btn.textContent = t;
    btn.addEventListener("click", () => {
      tallaSeleccionada = t; tallasWrap.querySelectorAll(".talla-btn").forEach((b) => b.classList.remove("selected")); btn.classList.add("selected");
    });
    tallasWrap.appendChild(btn);
  });

  if (!sinStock) card.querySelector(".add-btn").addEventListener("click", () => addToCart(product, tallaSeleccionada));
  return card;
}

// ACTUALIZA EL TÍTULO Y DESCRIPCIÓN PARA GOOGLE
function updateSEO(product = null) {
  const titleEl = document.querySelector("title");
  const descEl = document.querySelector('meta[name="description"]');
  const ogTitle = document.querySelector('meta[property="og:title"]');
  const ogDesc = document.querySelector('meta[property="og:description"]');
  const ogImage = document.querySelector('meta[property="og:image"]');
  const canonical = document.querySelector('link[rel="canonical"]');

  if (product) {
    const pageTitle = `${product.nombre} | URbar Store`;
    const pageDesc = `Compra ${product.nombre} del ${product.equipo}. Calidad ${product.calidad}, tallas ${product.tallas.join(', ')}. Envíos a toda Colombia.`;
    const pageUrl = `https://distribuidora-urbar.vercel.app/producto/${product.id}`;

    if (titleEl) titleEl.textContent = pageTitle;
    if (descEl) descEl.setAttribute("content", pageDesc);
    if (ogTitle) ogTitle.setAttribute("content", pageTitle);
    if (ogDesc) ogDesc.setAttribute("content", pageDesc);
    if (ogImage) ogImage.setAttribute("content", product.imagen);
    if (canonical) canonical.setAttribute("href", pageUrl);
    
    // Actualizamos la URL en el navegador sin recargar
    window.history.pushState({ productId: product.id }, '', `/producto/${product.id}`);
  } else {
    // Restaurar valores por defecto (Catálogo)
    const defaultTitle = `Camisetas Retro y Nuevas de Fútbol | URbar Store`;
    const defaultDesc = `Compra camisetas retro, buzos y sudaderas de América de Cali, Atlético Nacional y Millonarios. Calidad AAA, envíos a toda Colombia.`;
    const defaultImage = "https://i.postimg.cc/B6NzhDjp/Pasion-deportiva-en-verde-neon.png";
    const defaultUrl = "https://distribuidora-urbar.vercel.app/";

    if (titleEl) titleEl.textContent = defaultTitle;
    if (descEl) descEl.setAttribute("content", defaultDesc);
    if (ogTitle) ogTitle.setAttribute("content", defaultTitle);
    if (ogDesc) ogDesc.setAttribute("content", defaultDesc);
    if (ogImage) ogImage.setAttribute("content", defaultImage);
    if (canonical) canonical.setAttribute("href", defaultUrl);

    window.history.pushState({}, '', '/');
  }
}

function openProductDetail(id, updateUrl = true) {
  const product = state.products.find(p => p.id === id);
  if (!product) return;
  state.currentProduct = product;

  $("#catalogView").classList.add("hidden");
  $("#productDetailView").classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: 'smooth' });

  $("#detailBreadcrumb").textContent = product.nombre;
  $("#detailImage").src = product.imagen;
  $("#detailImage").alt = product.nombre;
  $("#detailMeta").textContent = `${product.equipo} · ${product.tipo}`;
  $("#detailTitle").textContent = product.nombre;
  $("#detailPrice").textContent = formatCOP(product.precio);
  $("#detailQuality").textContent = product.calidad;
  $("#detailGender").textContent = product.genero;
  $("#detailStock").textContent = product.stock > 0 ? `${product.stock} disponibles` : "Agotado";

  // Solo actualizamos la URL si venimos de un clic (no si recargamos la página)
  if (updateUrl) updateSEO(product);

  const sizesWrap = $("#detailSizes");
  sizesWrap.innerHTML = "";
  let selectedSize = product.tallas[0];
  
  product.tallas.forEach(t => {
    const btn = document.createElement("button");
    btn.className = "talla-btn" + (t === selectedSize ? " selected" : "");
    btn.textContent = t;
    btn.addEventListener('click', () => {
      selectedSize = t;
      sizesWrap.querySelectorAll('.talla-btn').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
    });
    sizesWrap.appendChild(btn);
  });

  const addBtn = $("#detailAddBtn");
  if (product.stock <= 0) {
    addBtn.disabled = true; addBtn.textContent = "Agotado";
  } else {
    addBtn.disabled = false; addBtn.textContent = "Agregar al carrito 🛒";
    const newBtn = addBtn.cloneNode(true);
    addBtn.parentNode.replaceChild(newBtn, addBtn);
    newBtn.addEventListener('click', () => addToCart(product, selectedSize));
  }

  const suggestionsWrap = $("#suggestionsList");
  suggestionsWrap.innerHTML = "";
  const suggestions = state.products.filter(p => p.id !== product.id).sort(() => 0.5 - Math.random()).slice(0, 5);

  suggestions.forEach(s => {
    const div = document.createElement("div");
    div.className = "suggestion-item";
    div.innerHTML = `
      <img src="${s.imagen}" alt="${s.nombre}" />
      <div class="suggestion-item-info">
        <p>${s.nombre}</p>
        <span>${formatCOP(s.precio)}</span>
      </div>
    `;
    div.addEventListener('click', () => openProductDetail(s.id, true));
    suggestionsWrap.appendChild(div);
  });
}

function showCatalog(e) {
  if(e) e.preventDefault();
  $("#productDetailView").classList.add("hidden");
  $("#catalogView").classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: 'smooth' });
  updateSEO(); // Restaura el título de la tienda
}

function addToCart(product, talla, cantidad = 1) {
  const idx = state.cart.findIndex((i) => i.product.id === product.id && i.talla === talla);
  if (idx >= 0) state.cart[idx].cantidad += cantidad; else state.cart.push({ product, talla, cantidad });
  saveCart(); updateCartCount(); renderCart(); openCart(); toast("Agregado 🛒");
}

function removeFromCart(id, talla) {
  state.cart = state.cart.filter((i) => !(i.product.id === id && i.talla === talla)); 
  saveCart(); updateCartCount(); renderCart();
}

function updateQty(id, talla, cantidad) {
  if (cantidad <= 0) return removeFromCart(id, talla);
  const item = state.cart.find((i) => i.product.id === id && i.talla === talla);
  if (item) { item.cantidad = cantidad; saveCart(); updateCartCount(); renderCart(); }
}

function getCartTotal() { return state.cart.reduce((acc, i) => acc + i.product.precio * i.cantidad, 0); }
function getCartCount() { return state.cart.reduce((acc, i) => acc + i.cantidad, 0); }

function updateCartCount() {
  const count = getCartCount(); $("#cartCount").textContent = count; $("#cartCount").classList.toggle("hidden", count === 0);
}

function renderCart() {
  const wrap = $("#cartItems"); wrap.innerHTML = "";
  if (state.cart.length === 0) {
    wrap.innerHTML = '<p class="cart-empty">Tu carrito está vacío.</p>';
    $("#cartTotal").textContent = "$0"; $("#goCheckout").disabled = true; return;
  }
  state.cart.forEach((item) => {
    const div = document.createElement("div"); div.className = "cart-item";
    div.innerHTML = `
      <img src="${item.product.imagen}" alt="${item.product.nombre}" />
      <div class="cart-item-info">
        <p class="cart-item-name">${item.product.nombre}</p>
        <p class="cart-item-meta">Talla ${item.talla} · ${formatCOP(item.product.precio)}</p>
        <div class="cart-item-controls">
          <button class="qty-btn" data-action="minus">−</button><span class="qty-value">${item.cantidad}</span>
          <button class="qty-btn" data-action="plus">+</button><button class="remove-btn" data-action="remove">Quitar</button>
        </div>
      </div>
    `;
    div.querySelector('[data-action="minus"]').addEventListener("click", () => updateQty(item.product.id, item.talla, item.cantidad - 1));
    div.querySelector('[data-action="plus"]').addEventListener("click", () => updateQty(item.product.id, item.talla, item.cantidad + 1));
    div.querySelector('[data-action="remove"]').addEventListener("click", () => removeFromCart(item.product.id, item.talla));
    wrap.appendChild(div);
  });
  $("#cartTotal").textContent = formatCOP(getCartTotal()); $("#goCheckout").disabled = false;
}

function openCart() { $("#cartOverlay").classList.remove("hidden"); $("#cartDrawer").classList.remove("hidden"); }
function closeCart() { $("#cartOverlay").classList.add("hidden"); $("#cartDrawer").classList.add("hidden"); showCartView(); }
function showCartView() { $("#cartView").classList.remove("hidden"); $("#checkoutView").classList.add("hidden"); $("#successView").classList.add("hidden"); }
function showCheckoutView() { $("#cartView").classList.add("hidden"); $("#checkoutView").classList.remove("hidden"); $("#successView").classList.add("hidden"); $("#checkoutTotal").textContent = formatCOP(getCartTotal()); }
function showSuccessView() { 
  $("#cartView").classList.add("hidden"); 
  $("#checkoutView").classList.add("hidden"); 
  $("#successView").classList.remove("hidden"); 
}

async function submitOrder(e) {
  e.preventDefault();
  const errorEl = $("#checkoutError"); errorEl.classList.add("hidden");

  const cliente = $("#cliente").value.trim(); const email = $("#email").value.trim();
  const telefono = $("#telefono").value.trim(); const direccion = $("#direccion").value.trim();
  const ciudad = $("#ciudad").value.trim();

  if (!cliente || !telefono || !direccion) {
    errorEl.textContent = "Completa nombre, teléfono y dirección."; errorEl.classList.remove("hidden"); return;
  }

  const totalCalculado = getCartTotal();
  
  const cartParaAnalytics = state.cart.map((i) => ({
    item_id: i.product.id,
    item_name: i.product.nombre,
    price: i.product.precio,
    quantity: i.cantidad
  }));

  const order = {
    cliente, email, telefono, direccion, ciudad,
    items: state.cart.map((i) => ({ id: i.product.id, nombre: i.product.nombre, talla: i.talla, cantidad: i.cantidad, precio: i.product.precio })),
    total: totalCalculado,
  };

  const btn = $("#submitOrder"); btn.disabled = true; btn.textContent = "Enviando...";

  try {
    const response = await postJSON({ action: "addOrder", order });
    try { await postJSON({ action: "updateStock", items: state.cart.map((i) => ({ id: i.product.id, cantidad: i.cantidad })) }); } catch (err) {}

    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({
      'event': 'purchase',
      'ecommerce': {
        'transaction_id': 'ORDEN-' + new Date().getTime(),
        'value': totalCalculado,
        'currency': 'COP',
        'items': cartParaAnalytics
      }
    });

    if (typeof fbq === 'function') {
      fbq('track', 'Purchase', {
        value: totalCalculado,
        currency: 'COP',
        contents: cartParaAnalytics,
        content_type: 'product'
      });
    }

    const phoneWA = '573005177418'; 
    let textWA = `¡Hola *URBAR STORE*! Aquí está el recibo de mi pedido:\n\n`;
    textWA += `*Cliente:* ${cliente}\n*Dirección:* ${direccion}, ${ciudad}\n\n*Productos:*\n`;
    state.cart.forEach(i => { textWA += `👕 ${i.cantidad}x ${i.product.nombre} (Talla: ${i.talla})\n`; });
    textWA += `\n*Total:* ${formatCOP(totalCalculado)}\n\nAdjunto mi comprobante. ⚽`;

    $("#whatsappReceiptBtn").href = `https://wa.me/${phoneWA}?text=${encodeURIComponent(textWA)}`;
    $("#successTotal").textContent = formatCOP(totalCalculado);

    if (response.wompiLink) {
      $("#wompiPayBtn").href = response.wompiLink;
      $("#wompiPayBtn").style.display = "block";
    } else {
      alert("⚠️ Hubo un error al generar el link de pago de Wompi. Por favor usa el pago por Nequi/Daviplata o revisa la consola de Apps Script.");
      $("#wompiPayBtn").style.display = "none"; 
    }

    state.cart = []; saveCart(); updateCartCount(); renderCart(); showSuccessView();
    setTimeout(() => loadProducts(), 1500);
  } catch (err) {
    errorEl.textContent = err.message || "Error al enviar."; errorEl.classList.remove("hidden");
  } finally {
    btn.disabled = false; btn.textContent = "Confirmar pedido";
  }
}

function bindEvents() {
  $("#cartBtn").addEventListener("click", openCart); $("#closeCart").addEventListener("click", closeCart);
  $("#cartOverlay").addEventListener("click", closeCart); $("#goCheckout").addEventListener("click", showCheckoutView);
  $("#backToCart").addEventListener("click", showCartView); $("#continueShopping").addEventListener("click", closeCart);
  $("#checkoutView").addEventListener("submit", submitOrder);

  $("#searchInput").addEventListener("input", (e) => { 
    state.filters.search = e.target.value; 
    if(!$("#catalogView").classList.contains("hidden")) renderProducts(); 
  });
  $("#tipoFilter").addEventListener("change", (e) => { state.filters.tipo = e.target.value; renderProducts(); });
  $("#generoFilter").addEventListener("change", (e) => { state.filters.genero = e.target.value; renderProducts(); });
  $("#ordenFilter").addEventListener("change", (e) => { state.filters.orden = e.target.value; renderProducts(); });
  $("#destacadosFilter").addEventListener("change", (e) => { state.filters.soloDestacados = e.target.checked; renderProducts(); });
  
  $("#clearFilters").addEventListener("click", () => {
    state.filters = { equipo: "", tipo: "", genero: "", search: "", soloDestacados: false, orden: "none" };
    $("#searchInput").value = ""; $("#tipoFilter").value = ""; $("#generoFilter").value = ""; $("#ordenFilter").value = "none"; $("#destacadosFilter").checked = false;
    document.querySelectorAll('.sub-nav a').forEach(l => l.classList.remove('active'));
    document.querySelector('.sub-nav a[data-filter="inicio"]').classList.add('active');
    renderProducts();
  });

  document.querySelectorAll('.sub-nav a').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      showCatalog();
      document.querySelectorAll('.sub-nav a').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      const filter = link.dataset.filter;
      
      if (filter === 'inicio') {
        state.filters = { equipo: "", tipo: "", genero: "", search: "", soloDestacados: false, orden: "none" };
        $("#tipoFilter").value = ""; $("#generoFilter").value = ""; $("#ordenFilter").value = "none"; $("#destacadosFilter").checked = false;
      } else if (filter === 'ofertas') {
        state.filters.tipo = ""; state.filters.soloDestacados = true;
        $("#tipoFilter").value = ""; $("#destacadosFilter").checked = true;
      } else {
        state.filters.tipo = filter; state.filters.soloDestacados = false;
        $("#tipoFilter").value = filter; $("#destacadosFilter").checked = false;
      }
      state.filters.equipo = ""; 
      renderProducts();
      document.querySelector('.catalog-header').scrollIntoView({ behavior: 'smooth' });
    });
  });
  
  // Manejar el botón "Atrás" del navegador
  window.addEventListener('popstate', (e) => {
    if (e.state && e.state.productId) {
      openProductDetail(e.state.productId, false);
    } else {
      $("#productDetailView").classList.add("hidden");
      $("#catalogView").classList.remove("hidden");
      updateSEO();
    }
  });
}

function updateProductStructuredData(products) {
  const id = "product-list-jsonld"; let script = document.getElementById(id);
  if (!script) { script = document.createElement("script"); script.id = id; script.type = "application/ld+json"; document.head.appendChild(script); }
  const data = {
    "@context": "https://schema.org", "@type": "ItemList",
    "itemListElement": products.map((p, i) => ({
      "@type": "ListItem", "position": i + 1,
      "item": { "@type": "Product", "name": p.nombre, "image": p.imagen, "offers": { "@type": "Offer", "priceCurrency": "COP", "price": p.precio, "availability": p.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock" } }
    }))
  };
  script.textContent = JSON.stringify(data);
}

document.addEventListener("DOMContentLoaded", () => {
  loadCart(); bindEvents(); renderCart(); updateCartCount(); loadProducts(); 
  $("#footerYear").textContent = new Date().getFullYear();
});
