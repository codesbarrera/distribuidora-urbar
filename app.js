/* ============================================================
   SEO: JSON-LD dinámico por producto (ItemList + Product)
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
        "brand": {
          "@type": "Brand",
          "name": p.equipo
        },
        "category": p.tipo,
        "offers": {
          "@type": "Offer",
          "priceCurrency": "COP",
          "price": p.precio,
          "availability": p.stock > 0
            ? "https://schema.org/InStock"
            : "https://schema.org/OutOfStock",
          "url": API_URL
        }
      }
    }))
  };

  script.textContent = JSON.stringify(data);
}
