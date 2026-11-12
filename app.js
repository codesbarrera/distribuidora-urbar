/* ============================================================
   CONFIGURACIÓN — URL de Apps Script
   ============================================================ */
const API_URL =
  "https://script.google.com/macros/s/AKfycbweIOoPaQEcS6mSxMe1N575-timimyPx-z7XLvX3DGlugYIdRjhYAXbFtPTuUQsBSw/exec";

/* ============================================================
   ESTADO GLOBAL
   ============================================================ */
const state = {
  products: [],
  cart: [], // { product, talla, cantidad }
  filters: {
    equipo: "",
    tipo: "",
    genero: "",
    search: "",
    soloDestacados: false,
    orden: "none",
  },
};

/* ============================================================
   UTILIDADES
   ============================================================ */
const $ = (sel) => document.querySelector(sel);

const formatCOP = (n) =>
  new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(n);

function toast(msg, ms = 2500) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

async function getJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || "Error desconocido");
  return json.data;
}

async function postJSON(body) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(body),
    redirect: "follow",
  });
  const json = await res.json();
  if (!json.success) throw new Error(json.error || "Error desconocido");
  return json.data;
}

/* ============================================================
   CARGA DE PRODUCTOS (Aquí está la Edición 1)
   ============================================================ */
async function loadProducts() {
  try {
    const products = await getJSON(`${API_URL}?action=getProducts`);
    state.products = products;
    buildFilterOptions();
    renderProducts();
    updateCartCount();
    
    // EDICIÓN 1: Esta línea activa el SEO
    updateProductStructuredData(products); 
    
  } catch (err) {
    $("#resultsCount").textContent = "Error al cargar productos: " + err.message;
    console.error(err);
  }
}

/* ============================================================
   FILTROS
   ============================================================ */
function buildFilterOptions() {
  const equipos = [...new Set(state.products.map((p) => p.equipo))].sort();
  const tipos = [...new Set(state.products.map((p) => p.tipo))].sort();
  const generos = [...new Set(state.products.map((p) => p.genero))].sort();

  const fill = (select, values, label) => {
    select.innerHTML = `<option value="">${label}</option>`;
    values.forEach((v) => {
      const opt = document.createElement("option");
      opt.value = v;
      opt.textContent = v;
      select.appendChild(opt);
    });
  };

  fill($("#equipoFilter"), equipos, "Todos los equipos");
  fill($("#tipoFilter"), tipos, "Todos los tipos");
  fill($("#generoFilter"), generos, "Todos los géneros");
}

function applyFilters() {
  let list = [...state.products];

  if (state.filters.equipo) {
    list = list.filter((p) => p.equipo === state.filters.equipo);
  }
  if (state.filters.tipo) {
    list = list.filter((p) => p.tipo === state.filters.tipo);
  }
  if (state.filters.genero) {
    list = list.filter((p) => p.genero === state.filters.genero);
  }
  if (state.filters.soloDestacados) {
    list = list.filter((p) => p.destacado);
  }
  if (state.filters.search) {
    const q = state.filters.search.toLowerCase();
    list = list.filter(
      (p) =>
        p.nombre.toLowerCase().includes(q) ||
        p.equipo.toLowerCase().includes(q) ||
        p.tipo.toLowerCase().includes(q)
    );
  }
  if (state.filters.orden === "asc") {
    list.sort((a, b) => a.precio - b.precio);
  } else if (state.filters.orden === "desc") {
    list.sort((a, b) => b.precio - a.precio);
  }

  return list;
}

/* ============================================================
   RENDER DE PRODUCTOS
   ============================================================ */
function renderProducts() {
  const grid = $("#productsGrid");
  const list = applyFilters();

  $("#resultsCount").textContent = `${list.length} producto(s) encontrado(s)`;
  $("#emptyMessage").classList.toggle("hidden", list.length > 0);

  grid.innerHTML = "";
  list.forEach((p) => grid.appendChild(createProductCard(p)));
}

function createProductCard(product) {
  const card = document.createElement("article");
  card.className = "product-card";

  const sinStock = product.stock <= 0;
  const tallaInicial = product.tallas[0] || "";

  card.innerHTML = `
    <div class="product-image-wrap">
      <img src="${product.imagen}" alt="${product.nombre}" loading="lazy" />
      ${product.destacado ? '<span class="badge badge-destacado">⭐ Destacado</span>' : ""}
      ${sinStock ? '<span class="badge badge-agotado">Agotado</span>' : ""}
    </div>
    <div class="product-body">
      <p class="product-meta">${product.equipo} · ${product.tipo}</p>
      <h3 class="product-name">${product.nombre || "Sin nombre"}</h3>
      <p class="product-price">${formatCOP(product.precio)}</p>
      <div class="tallas"></div>
      <button class="add-btn" ${sinStock ? "disabled" : ""}>
        ${sinStock ? "Agotado" : "Agregar al carrito"}
      </button>
    </div>
  `;

  const tallasWrap = card.querySelector(".tallas");
  let tallaSeleccionada = tallaInicial;

  product.tallas.forEach((t) => {
    const btn = document.createElement("button");
    btn.className = "talla-btn" + (t === tallaInicial ? " selected" : "");
    btn.textContent = t;
    btn.addEventListener("click", () => {
      tallaSeleccionada = t;
      tallasWrap
        .querySelectorAll(".talla-btn")
        .forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
    });
    tallasWrap.appendChild(btn);
  });

  const addBtn = card.querySelector(".add-btn");
  if (!sinStock) {
    addBtn.addEventListener("click", () => {
      if (!tallaSeleccionada) {
        toast("Selecciona una talla");
        return;
      }
      addToCart(product, tallaSeleccionada);
    });
  }

  return card;
}

/* ============================================================
   CARRITO
   ============================================================ */
function addToCart(product, talla, cantidad = 1) {
  const idx = state.cart.findIndex(
    (i) => i.product.id === product.id && i.talla === talla
  );

  if (idx >= 0) {
    state.cart[idx].cantidad += cantidad;
  } else {
    state.cart.push({ product, talla, cantidad });
  }

  updateCartCount();
  renderCart();
  openCart();
  toast("Agregado al carrito 🛒");
}

function removeFromCart(id, talla) {
  state.cart = state.cart.filter(
    (i) => !(i.product.id === id && i.talla === talla)
  );
  updateCartCount();
  renderCart();
}

function updateQty(id, talla, cantidad) {
  if (cantidad <= 0) return removeFromCart(id, talla);
  const item = state.cart.find(
    (i) => i.product.id === id && i.talla === talla
  );
  if (item) {
    item.cantidad = cantidad;
    updateCartCount();
    renderCart();
  }
}

function getCartTotal() {
  return state.cart.reduce(
    (acc, i) => acc + i.product.precio * i.cantidad,
    0
  );
}

function getCartCount() {
  return state.cart.reduce((acc, i) => acc + i.cantidad, 0);
}

function updateCartCount() {
  const count = getCartCount();
  const badge = $("#cartCount");
  badge.textContent = count;
  badge.classList.toggle("hidden", count === 0);
}

function renderCart() {
  const wrap = $("#cartItems");
  wrap.innerHTML = "";

  if (state.cart.length === 0) {
    wrap.innerHTML = '<p class="cart-empty">Tu carrito está vacío.</p>';
    $("#cartTotal").textContent = "$0";
    $("#goCheckout").disabled = true;
    return;
  }

  state.cart.forEach((item) => {
    const div = document.createElement("div");
    div.className = "cart-item";
    div.innerHTML = `
      <img src="${item.product.imagen}" alt="${item.product.nombre}" />
      <div class="cart-item-info">
        <p class="cart-item-name">${item.product.nombre}</p>
        <p class="cart-item-meta">
          Talla ${item.talla} · ${formatCOP(item.product.precio)}
        </p>
        <div class="cart-item-controls">
          <button class="qty-btn" data-action="minus">−</button>
          <span class="qty-value">${item.cantidad}</span>
          <button class="qty-btn" data-action="plus">+</button>
          <button class="remove-btn" data-action="remove">Quitar</button>
        </div>
      </div>
    `;

    div.querySelector('[data-action="minus"]').addEventListener("click", () =>
      updateQty(item.product.id, item.talla, item.cantidad - 1)
    );
    div.querySelector('[data-action="plus"]').addEventListener("click", () =>
      updateQty(item.product.id, item.talla, item.cantidad + 1)
    );
    div.querySelector('[data-action="remove"]').addEventListener("click", () =>
      removeFromCart(item.product.id, item.talla)
    );

    wrap.appendChild(div);
  });

  $("#cartTotal").textContent = formatCOP(getCartTotal());
  $("#goCheckout").disabled = false;
}

/* ============================================================
   DRAWER / VISTAS
   ============================================================ */
function openCart() {
  $("#cartOverlay").classList.remove("hidden");
  $("#cartDrawer").classList.remove("hidden");
}

function closeCart() {
  $("#cartOverlay").classList.add("hidden");
  $("#cartDrawer").classList.add("hidden");
  showCartView();
}

function showCartView() {
  $("#cartView").classList.remove("hidden");
  $("#checkoutView").classList.add("hidden");
  $("#successView").classList.add("hidden");
  $("#cartTitle").textContent = "Tu carrito";
}

function showCheckoutView() {
  $("#cartView").classList.add("hidden");
  $("#checkoutView").classList.remove("hidden");
  $("#successView").classList.add("hidden");
  $("#cartTitle").textContent = "Datos de envío";
  $("#checkoutTotal").textContent = formatCOP(getCartTotal());
}

function showSuccessView() {
  $("#cartView").classList.add("hidden");
  $("#checkoutView").classList.add("hidden");
  $("#successView").classList.remove("hidden");
  $("#cartTitle").textContent = "¡Pedido enviado!";
}

/* ============================================================
   CHECKOUT
   ============================================================ */
async function submitOrder(e) {
  e.preventDefault();
  const errorEl = $("#checkoutError");
  errorEl.classList.add("hidden");

  const cliente = $("#cliente").value.trim();
  const email = $("#email").value.trim();
  const telefono = $("#telefono").value.trim();
  const direccion = $("#direccion").value.trim();
  const ciudad = $("#ciudad").value.trim();

  if (!cliente || !telefono || !direccion) {
    errorEl.textContent = "Completa nombre, teléfono y dirección.";
    errorEl.classList.remove("hidden");
    return;
  }

  const order = {
    cliente,
    email,
    telefono,
    direccion,
    ciudad,
    items: state.cart.map((i) => ({
      id: i.product.id,
      nombre: i.product.nombre,
      talla: i.talla,
      cantidad: i.cantidad,
      precio: i.product.precio,
    })),
    total: getCartTotal(),
  };

  const btn = $("#submitOrder");
  btn.disabled = true;
  btn.textContent = "Enviando...";

  try {
    await postJSON({ action: "addOrder", order });

    try {
      await postJSON({
        action: "updateStock",
        items: state.cart.map((i) => ({
          id: i.product.id,
          cantidad: i.cantidad,
        })),
      });
    } catch (err) {
      console.warn("Stock no actualizado:", err);
    }

    state.cart = [];
    updateCartCount();
    renderCart();
    showSuccessView();

    setTimeout(() => loadProducts(), 1500);
  } catch (err) {
    errorEl.textContent = err.message || "Error al enviar el pedido.";
    errorEl.classList.remove("hidden");
  } finally {
    btn.disabled = false;
    btn.textContent = "Confirmar pedido";
  }
}

/* ============================================================
   EVENTOS
   ============================================================ */
function bindEvents() {
  $("#cartBtn").addEventListener("click", openCart);
  $("#closeCart").addEventListener("click", closeCart);
  $("#cartOverlay").addEventListener("click", closeCart);
  $("#goCheckout").addEventListener("click", showCheckoutView);
  $("#backToCart").addEventListener("click", showCartView);
  $("#continueShopping").addEventListener("click", closeCart);
  $("#checkoutView").addEventListener("submit", submitOrder);

  $("#searchInput").addEventListener("input", (e) => {
    state.filters.search = e.target.value;
    renderProducts();
  });
  $("#equipoFilter").addEventListener("change", (e) => {
    state.filters.equipo = e.target.value;
    renderProducts();
  });
  $("#tipoFilter").addEventListener("change", (e) => {
    state.filters.tipo = e.target.value;
    renderProducts();
  });
  $("#generoFilter").addEventListener("change", (e) => {
    state.filters.genero = e.target.value;
    renderProducts();
  });
  $("#ordenFilter").addEventListener("change", (e) => {
    state.filters.orden = e.target.value;
    renderProducts();
  });
  $("#destacadosFilter").addEventListener("change", (e) => {
    state.filters.soloDestacados = e.target.checked;
    renderProducts();
  });
  $("#clearFilters").addEventListener("click", () => {
    state.filters = {
      equipo: "",
      tipo: "",
      genero: "",
      search: "",
      soloDestacados: false,
      orden: "none",
    };
    $("#searchInput").value = "";
    $("#equipoFilter").value = "";
    $("#tipoFilter").value = "";
    $("#generoFilter").value = "";
    $("#ordenFilter").value = "none";
    $("#destacadosFilter").checked = false;
    renderProducts();
  });
}

/* ============================================================
   EDICIÓN 2: FUNCIÓN DE SEO (JSON-LD)
   ============================================================ */
function updateProductStructuredData(products) {
  const id = "product-list-jsonld";
  let script = document.getElementById(id);
  if (!script) {
    script = document.createElement("script");
    script.id = id;
    script.type = "application/ld+json";
    document.head.appendChild(script);
  }

  const data = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "itemListElement": products.map((p, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "item": {
        "@type": "Product",
        "name": p.nombre || "Camiseta",
        "image": p.imagen,
        "description": `${p.tipo} ${p.nombre || ""} del ${p.equipo}, calidad ${p.calidad}. Tallas: ${p.tallas.join(", ")}.`.trim(),
        "brand": { "@type": "Brand", "name": p.equipo },
        "category": p.tipo,
        "offers": {
          "@type": "Offer",
          "priceCurrency": "COP",
          "price": p.precio,
          "availability": p.stock > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
          "url": API_URL
        }
      }
    }))
  };
  script.textContent = JSON.stringify(data);
}

/* ============================================================
   INICIO
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  bindEvents();
  renderCart();
  loadProducts();
});
