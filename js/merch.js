/* SOD Festival Merchandise Alpine.js Application Script */

document.addEventListener("alpine:init", () => {
  const getProductPurchaseLimit = (product, variant = null) => {
    if (!product || product.is_out_of_stock) return 0;

    if (variant) {
      const vQty = Number(variant.quantity);
      return Number.isFinite(vQty) && vQty >= 0 ? vQty : 0;
    }

    const availableStock = Number(product.quantity);
    const maxQty = Number(product.max_quantity);

    const stockLimit = Number.isFinite(availableStock) && availableStock >= 0
      ? availableStock
      : Number.MAX_SAFE_INTEGER;
    const purchaseLimit = Number.isFinite(maxQty) && maxQty >= 0
      ? maxQty
      : Number.MAX_SAFE_INTEGER;

    const combinedLimit = Math.min(stockLimit, purchaseLimit);
    if (combinedLimit !== Number.MAX_SAFE_INTEGER) return combinedLimit;

    // Backward compatibility for older payloads that still use `quantity`.
    const legacyQty = Number(product.quantity);
    if (Number.isFinite(legacyQty) && legacyQty > 0) return legacyQty;

    // No explicit stock limit in payload.
    return Number.MAX_SAFE_INTEGER;
  };

  // 1. Global Cart Store (persisted in localStorage)
  Alpine.store("cart", {
    items: JSON.parse(localStorage.getItem("sod_merch_cart") || "[]"),
    
    save() {
      localStorage.setItem("sod_merch_cart", JSON.stringify(this.items));
    },

    addItem(product, variant = null, customCode = "") {
      if (!product) return;

      if (product.has_variants && (!product.variants || product.variants.length > 0) && !variant) {
        alert("Please select a size / variant.");
        return;
      }

      if (product.is_code_required && (!customCode || !customCode.trim())) {
        const label = product.code_label || "Ticket ID";
        alert(`Please enter your ${label} for '${product.title}'.`);
        return;
      }

      const limit = getProductPurchaseLimit(product, variant);
      if (limit <= 0) {
        alert("This item / variant is currently out of stock.");
        return;
      }

      const variantId = variant ? variant.id : null;
      const variantName = variant ? variant.name : null;
      const price = variant && variant.price !== null && variant.price !== undefined && !Number.isNaN(Number(variant.price))
        ? Number(variant.price)
        : Number(product.price);

      const existing = this.items.find(
        (i) => i.product_id === product.id && (i.variant_id || null) === (variantId || null)
      );

      if (existing) {
        existing.stock = limit;
        if (existing.quantity < limit) {
          existing.quantity++;
          if (customCode && customCode.trim()) existing.custom_code = customCode.trim();
        } else {
          alert(`Maximum available stock reached (${limit})`);
        }
      } else {
        this.items.push({
          product_id: product.id,
          variant_id: variantId,
          variant_name: variantName,
          title: product.title,
          price: price,
          photo: product.photo,
          merchant_id: product.merchant_id,
          merchant_name: product.merchant_name,
          quantity: 1,
          stock: limit,
          weight: product.weight || 500,
          length: product.length || 0,
          width: product.width || 0,
          height: product.height || 0,
          is_code_required: Boolean(product.is_code_required),
          code_label: product.code_label || "Ticket ID",
          custom_code: customCode ? customCode.trim() : "",
          is_include_ongkir: Boolean(product.is_include_ongkir),
          merchant_rajaongkir_dest_id: product.merchant_rajaongkir_dest_id || null,
        });
      }
      this.save();
    },

    removeItem(productId, variantId = null) {
      this.items = this.items.filter(
        (i) => !(i.product_id === productId && (i.variant_id || null) === (variantId || null))
      );
      this.save();
    },

    updateQuantity(productId, qty, variantId = null) {
      const item = this.items.find(
        (i) => i.product_id === productId && (i.variant_id || null) === (variantId || null)
      );
      if (item) {
        if (qty <= 0) {
          this.removeItem(productId, variantId);
        } else {
          const maxStock = item.stock !== undefined && item.stock !== null
            ? Number(item.stock)
            : Number.MAX_SAFE_INTEGER;
          const limit = maxStock;
          if (qty > limit) {
            alert(`Maximum allowed quantity is ${limit} per item`);
            item.quantity = limit;
          } else {
            item.quantity = qty;
          }
          this.save();
        }
      }
    },

    syncStockFromProducts(products) {
      if (!Array.isArray(products) || products.length === 0 || this.items.length === 0) {
        return false;
      }

      const productMap = new Map(
        products.map((p) => [Number(p.id), p])
      );

      let changed = false;
      this.items = this.items
        .map((item) => {
          const product = productMap.get(Number(item.product_id));
          if (!product) return item;

          let variantObj = null;
          if (item.variant_id && Array.isArray(product.variants)) {
            variantObj = product.variants.find((v) => Number(v.id) === Number(item.variant_id));
          }

          const limit = getProductPurchaseLimit(product, variantObj);
          const nextItem = { ...item };

          if (nextItem.stock !== limit) {
            nextItem.stock = limit;
            changed = true;
          }

          if (nextItem.merchant_rajaongkir_dest_id !== (product.merchant_rajaongkir_dest_id || null)) {
            nextItem.merchant_rajaongkir_dest_id = product.merchant_rajaongkir_dest_id || null;
            changed = true;
          }

          if (Number(nextItem.quantity) > limit) {
            nextItem.quantity = limit;
            changed = true;
          }

          return nextItem;
        })
        .filter((item) => {
          if (Number(item.quantity) <= 0) {
            changed = true;
            return false;
          }
          return true;
        });

      if (changed) this.save();
      return changed;
    },

    clear() {
      this.items = [];
      this.save();
    },

    get totalItems() {
      return this.items.reduce((sum, i) => sum + i.quantity, 0);
    },

    get subtotal() {
      return this.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    },
  });

  // 2. Main Merchandise Component
  Alpine.data("merchApp", () => ({
    products: [],
    merchant: null,     // merchant info including PO flags
    loading: true,
    error: null,
    backendUrl: "https://sodtix.com", // Default local backend

    async init() {
      this.backendUrl = this.getBackendUrl();
      await this.fetchProducts();
    },

    async fetchProducts() {
      this.loading = true;
      try {
        const res = await fetch(`${this.backendUrl}/api/v1/public/merch/products?merchant_code=sodfestival`);
        const json = await res.json();
        if (json.success) {
          this.products = json.data;
          Alpine.store("cart").syncStockFromProducts(this.products);
          // Extract merchant PO info from first product (all share same merchant for sodfestival)
          if (this.products.length > 0) {
            this.merchant = {
              name: this.products[0].merchant_name,
              is_po: this.products[0].is_po || false,
              po_type: this.products[0].po_type || "po_days",
              po_days: this.products[0].po_days || null,
              po_date: this.products[0].po_date || null,
              is_voucher_required: Boolean(this.products[0].is_voucher_required),
              is_include_ongkir: Boolean(this.products[0].is_include_ongkir),
              event_id: this.products[0].event_id || null,
            };
            // Also sync merchant info to checkoutModal component
            const checkoutEl = document.getElementById("body");
            if (checkoutEl && checkoutEl._x_dataStack && checkoutEl._x_dataStack[0]) {
              checkoutEl._x_dataStack[0].merchant = this.merchant;
            }
          }
        } else {
          this.error = json.message || "Failed to load products";
        }
      } catch (err) {
        console.error("Fetch products error:", err);
        this.error = "Unable to connect to server";
      } finally {
        this.loading = false;
      }
    },

    /**
     * Returns PO label text for display
     */
    getPoLabel(merchant) {
      if (!merchant || !merchant.is_po) return null;
      if (merchant.po_type === "po_days" && merchant.po_days) {
        return `🕐 Pre-Order · Ships in ${merchant.po_days} days after payment`;
      }
      if (merchant.po_type === "po_date" && merchant.po_date) {
        const d = new Date(merchant.po_date);
        const formatted = d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
        return `🗓️ Pre-Order · All orders ship on ${formatted}`;
      }
      return "📦 Pre-Order";
    },

    get poLabel() {
      return this.getPoLabel(this.merchant);
    },

    get isPO() {
      return this.merchant && this.merchant.is_po;
    },

    formatRupiah(val) {
      return "IDR " + Number(val || 0).toLocaleString("id-ID");
    },

    getBackendUrl() {
      const origin = window.location.origin;
      if (origin.includes("sodtix.com")) {
        return origin;
      }
      if (origin.includes("sodfestival")) {
        return "https://sodtix.com";
      }
      return "https://sodtix.com";
    },

    getImageUrl(path) {
      if (!path) return "img/sodfavicon.png";
      if (path.startsWith("http")) return path;
      return `${this.backendUrl}${path}`;
    },

    getCartQuantity(productId) {
      if (!productId) return 0;
      const items = Alpine.store("cart").items.filter((i) => String(i.product_id) === String(productId));
      return items.reduce((sum, i) => sum + Number(i.quantity || 0), 0);
    },

    getProductPurchaseLimit(product) {
      return getProductPurchaseLimit(product);
    },

    isProductOutOfStock(product) {
      if (!product) return true;
      if (product.is_out_of_stock) return true;
      return this.getProductPurchaseLimit(product) <= 0;
    },
  }));

  // 3. Checkout & Payment Modal Component
  Alpine.data("checkoutModal", () => ({
    showModal: false,
    showPaymentModal: false,
    showExpiredPopup: false,
    step: "checkout", // 'checkout', 'qris', 'success'
    showDetailModal: false,
    detailProduct: null,
    selectedVariant: null,
    customCodeInput: "",
    merchant: null,

    // Event Pickup state
    is_event_pickup: false,

    isProductOutOfStock(product) {
      if (!product) return true;
      if (product.is_out_of_stock) return true;
      return getProductPurchaseLimit(product) <= 0;
    },

    // Form Fields
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    shipping_address: "",
    
    // City Search (new RajaOngkir API)
    cityQuery: "",
    citySearchResults: [],
    selectedCity: null,        // { id, label, province_name, city_name, district_name, zip_code }
    isSearchingCity: false,

    // Courier & Service
    courier: "jne",
    service: "",
    availableServices: [],     // from new calculate API: [ { shipping, shipping_type, price, etd, shipping_cashback } ]
    selectedServiceObj: null,  // full service object with cashback
    shippingCost: 0,
    shippingCashback: 0,       // for RajaOngkir create order
    isCalculatingShipping: false,

    // Voucher fields
    voucherCode: "",
    voucherDiscount: 0,
    isVoucherApplied: false,
    voucherError: "",
    voucherSuccessMsg: "",
    isCheckingVoucher: false,

    // Order & QRIS state
    isSubmitting: false,
    orderResponse: null,
    paymentStatus: "pending",
    timerDisplay: "15:00",
    pollInterval: null,
    timerInterval: null,

    async applyVoucher() {
      if (!this.voucherCode || !this.voucherCode.trim()) {
        this.voucherError = "Please enter a voucher code.";
        this.voucherSuccessMsg = "";
        return;
      }
      this.isCheckingVoucher = true;
      this.voucherError = "";
      this.voucherSuccessMsg = "";

      try {
        const backendUrl = this.getBackendUrl();
        const subtotal = Alpine.store("cart").subtotal;
        const res = await fetch(`${backendUrl}/api/v1/public/merch/voucher/check?code=${encodeURIComponent(this.voucherCode.trim())}&merchant_code=sodfestival&subtotal=${subtotal}`);
        const json = await res.json();

        if (json.success && json.data) {
          this.voucherDiscount = Number(json.data.discount_amount || 0);
          this.isVoucherApplied = true;
          this.voucherSuccessMsg = this.voucherDiscount > 0 
            ? `Voucher applied! Discount: IDR ${this.voucherDiscount.toLocaleString("id-ID")}`
            : "Code Valid";
          this.voucherError = "";
        } else {
          this.voucherError = json.message || "Invalid voucher code.";
          this.isVoucherApplied = false;
          this.voucherDiscount = 0;
          this.voucherSuccessMsg = "";
        }
      } catch (err) {
        console.error("Voucher check error:", err);
        this.voucherError = "Failed to connect to server for voucher validation.";
      } finally {
        this.isCheckingVoucher = false;
      }
    },

    removeVoucher() {
      this.voucherCode = "";
      this.voucherDiscount = 0;
      this.isVoucherApplied = false;
      this.voucherError = "";
      this.voucherSuccessMsg = "";
    },

    get isAllIncludeOngkir() {
      const items = Alpine.store("cart").items;
      return items.length > 0 && items.every((i) => i.is_include_ongkir);
    },

    get effectiveShippingCost() {
      if (this.is_event_pickup) {
        return 0;
      }
      if (this.isAllIncludeOngkir || (this.merchant && this.merchant.is_include_ongkir)) {
        return 0;
      }
      return Number(this.shippingCost || 0);
    },

    get totalPayable() {
      const sub = Alpine.store("cart").subtotal;
      return Math.max(0, sub - this.voucherDiscount) + this.effectiveShippingCost;
    },

    init() {
      this.$watch("cityQuery", (val) => {
        if (!val || val.length < 2 || (this.selectedCity && this.selectedCity.label === val)) {
          this.citySearchResults = [];
          return;
        }
        this.searchCityDebounced(val);
      });
      
      this.$watch("$store.cart.items", (val) => {
        if (this.showModal && this.selectedCity && !this.is_event_pickup) {
          if (val.length === 0) {
            if (this.step === "checkout") {
              this.closeCheckout();
            }
          } else {
            this.calculateShippingCost();
          }
        }
      });
    },

    openCheckout() {
      if (Alpine.store("cart").items.length === 0) {
        alert("Your cart is empty!");
        return;
      }
      this.showModal = true;
      this.showExpiredPopup = false;
      this.step = "checkout";
    },

    closeCheckout() {
      this.showModal = false;
      this.showExpiredPopup = false;
      clearInterval(this.pollInterval);
      clearInterval(this.timerInterval);
    },

    handleQrisExpired() {
      if (this.step !== "qris") return;
      this.timerDisplay = "EXPIRED";
      this.paymentStatus = "expired";
      this.showExpiredPopup = true;
      clearInterval(this.pollInterval);
      clearInterval(this.timerInterval);
    },

    closeExpiredPopupAndCheckout() {
      this.showExpiredPopup = false;
      this.step = "checkout";
      this.closeCheckout();
    },

    openProductDetail(product) {
      this.detailProduct = product;
      this.selectedVariant = product.has_variants && Array.isArray(product.variants) && product.variants.length > 0
        ? product.variants[0]
        : null;
      this.customCodeInput = "";
      this.showDetailModal = true;
    },

    closeProductDetail() {
      this.showDetailModal = false;
      this.detailProduct = null;
      this.selectedVariant = null;
      this.customCodeInput = "";
    },

    addDetailProductToCart() {
      if (!this.detailProduct) return;
      if (this.detailProduct.has_variants && !this.selectedVariant) {
        alert("Please select a variant / size.");
        return;
      }
      if (this.detailProduct.is_code_required && (!this.customCodeInput || !this.customCodeInput.trim())) {
        const label = this.detailProduct.code_label || "Ticket ID";
        alert(`Please enter your ${label}.`);
        return;
      }

      Alpine.store("cart").addItem(this.detailProduct, this.selectedVariant, this.customCodeInput);
      this.closeProductDetail();
    },

    getCarouselImages() {
      if (!this.detailProduct) return [];
      const list = [];
      if (this.detailProduct.photo) list.push(this.detailProduct.photo);
      if (this.detailProduct.photos && Array.isArray(this.detailProduct.photos)) {
        this.detailProduct.photos.forEach(p => {
          if (p && !list.includes(p)) list.push(p);
        });
      }
      return list;
    },

    getImageUrl(path) {
      if (!path) return "img/sodfavicon.png";
      if (path.startsWith("http")) return path;
      return `${this.getBackendUrl()}${path}`;
    },

    searchTimeout: null,
    searchCityDebounced(query) {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = setTimeout(async () => {
        this.isSearchingCity = true;
        try {
          const backendUrl = this.getBackendUrl();
          const res = await fetch(`${backendUrl}/api/v1/public/merch/shipping/search-city?q=${encodeURIComponent(query)}`);
          const json = await res.json();
          if (json.success) {
            this.citySearchResults = json.data || [];
          }
        } catch (err) {
          console.error("City search error:", err);
        } finally {
          this.isSearchingCity = false;
        }
      }, 350);
    },

    selectCity(item) {
      this.selectedCity = item;
      this.cityQuery = item.label || `${item.city_name || item.district_name || ""}, ${item.province_name || ""}`;
      this.citySearchResults = [];
      this.availableServices = [];
      this.shippingCost = 0;
      this.shippingCashback = 0;
      this.service = "";
      this.selectedServiceObj = null;
      if (!this.is_event_pickup) {
        this.calculateShippingCost();
      }
    },

    async calculateShippingCost() {
      if (this.is_event_pickup) {
        this.shippingCost = 0;
        this.shippingCashback = 0;
        return;
      }

      if (!this.selectedCity || !this.selectedCity.id) return;

      const cartItems = Alpine.store("cart").items;
      if (cartItems.length === 0) return;

      const totalWeight = cartItems.reduce((sum, i) => sum + (i.weight || 500) * i.quantity, 0);
      const itemValue = cartItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

      const maxLength = Math.max(...cartItems.map(i => i.length || 0), 0);
      const maxWidth = Math.max(...cartItems.map(i => i.width || 0), 0);
      const totalHeight = cartItems.reduce((sum, i) => sum + (i.height || 0) * i.quantity, 0);

      const shipperDestId = cartItems[0]?.merchant_rajaongkir_dest_id || null;

      this.isCalculatingShipping = true;
      this.availableServices = [];
      this.shippingCost = 0;
      this.shippingCashback = 0;
      this.service = "";
      this.selectedServiceObj = null;

      try {
        const backendUrl = this.getBackendUrl();
        const params = new URLSearchParams({
          receiver_destination_id: String(this.selectedCity.id),
          weight: totalWeight,
          item_value: itemValue,
          cod: false,
        });

        if (shipperDestId) {
          params.append("shipper_destination_id", String(shipperDestId));
        }

        if (maxLength > 0) params.append("length", String(maxLength));
        if (maxWidth > 0) params.append("width", String(maxWidth));
        if (totalHeight > 0) params.append("height", String(totalHeight));

        const res = await fetch(`${backendUrl}/api/v1/public/merch/shipping/calculate?${params.toString()}`);
        const json = await res.json();
        
        if (json.success && json.data) {
          const reguler = json.data.calculate_reguler || [];
          const cargo = json.data.calculate_cargo || [];
          const allServices = [...reguler, ...cargo].map((srv) => this.normalizeService(srv));
          
          this.availableServices = allServices;
          
          if (allServices.length > 0) {
            this.selectServiceObj(allServices[0]);
          }
        }
      } catch (err) {
        console.error("Calculate shipping cost error:", err);
      } finally {
        this.isCalculatingShipping = false;
      }
    },

    normalizeService(srvObj) {
      if (!srvObj) return null;
      return {
        ...srvObj,
        shipping_name: srvObj.shipping_name || srvObj.shipping || srvObj.courier || "",
        service_name: srvObj.service_name || srvObj.shipping_type || srvObj.service || "",
        shipping_cost: Number(
          srvObj.shipping_cost ?? srvObj.price ?? srvObj.cost ?? 0
        ),
        shipping_cashback: Number(
          srvObj.shipping_cashback ?? srvObj.price_cashback ?? 0
        ),
      };
    },

    selectServiceObj(srvObj) {
      if (!srvObj) return;
      const normalized = this.normalizeService(srvObj);
      if (!normalized) return;

      this.selectedServiceObj = normalized;
      this.courier = (normalized.shipping_name || "jne").toLowerCase();
      this.service = normalized.service_name || "";
      this.shippingCashback = Number(normalized.shipping_cashback || 0);

      if (this.is_event_pickup || (this.merchant && this.merchant.is_include_ongkir)) {
        this.shippingCost = 0;
      } else {
        this.shippingCost = Number(normalized.shipping_cost || 0);
      }
    },

    selectServiceByValue(val) {
      const found = this.availableServices.find(
        (s) => this.getServiceSelectValue(s) === val
      );
      if (found) this.selectServiceObj(found);
    },

    getServiceSelectValue(srv) {
      if (!srv) return "";
      const normalized = this.normalizeService(srv);
      return `${normalized.shipping_name}_${normalized.service_name}`;
    },

    getBackendUrl() {
      const origin = window.location.origin;
      if (origin.includes("sodtix.com")) {
        return origin;
      }
      if (origin.includes("sodfestival")) {
        return "https://sodtix.com";
      }
      return "https://sodtix.com";
    },

    async syncCartWithLatestProducts() {
      const backendUrl = this.getBackendUrl();
      const res = await fetch(`${backendUrl}/api/v1/public/merch/products?merchant_code=sodfestival`);
      const json = await res.json();
      if (!json.success || !Array.isArray(json.data)) {
        throw new Error(json.message || "Failed to validate cart stock");
      }
      return Alpine.store("cart").syncStockFromProducts(json.data);
    },

    async submitOrder() {
      if (!this.customer_name || !this.customer_email || !this.customer_phone) {
        alert("Please complete customer information fields.");
        return;
      }

      if (!this.is_event_pickup) {
        if (!this.shipping_address) {
          alert("Please enter a street address for delivery.");
          return;
        }
        if (!this.selectedCity || !this.selectedCity.id) {
          alert("Please select a valid destination city.");
          return;
        }
        if (!this.service) {
          alert("Please select a shipping service.");
          return;
        }
      }

      // Check required codes for cart items
      for (const item of Alpine.store("cart").items) {
        if (item.is_code_required && (!item.custom_code || !item.custom_code.trim())) {
          const label = item.code_label || "Ticket ID";
          alert(`Please enter ${label} for product '${item.title}' in your cart.`);
          return;
        }
      }

      try {
        const wasAdjusted = await this.syncCartWithLatestProducts();
        if (wasAdjusted) {
          alert("Some cart quantities were adjusted to the latest max quantity limits.");
        }
      } catch (err) {
        console.error("Cart stock validation error:", err);
        alert("Unable to validate product stock. Please try again.");
        return;
      }

      if (Alpine.store("cart").items.length === 0) {
        alert("Your cart is empty after stock validation.");
        return;
      }

      const payloadRaw = {
        customer_name: this.customer_name,
        customer_email: this.customer_email,
        customer_phone: this.customer_phone,
        fulfillment_type: this.is_event_pickup ? "pickup" : "delivery",
        shipping_address: this.is_event_pickup ? "Pickup at Event" : this.shipping_address,
        shipping_city_id: this.is_event_pickup ? null : (this.selectedCity ? String(this.selectedCity.id) : null),
        shipping_city_name: this.is_event_pickup ? "Pickup at Event" : (this.selectedCity?.label || this.selectedCity?.city_name || this.cityQuery),
        shipping_province: this.is_event_pickup ? "" : (this.selectedCity?.province_name || ""),
        shipping_courier: this.is_event_pickup ? "pickup" : this.courier,
        shipping_service: this.is_event_pickup ? "Event Pickup" : this.service,
        shipping_cost: this.is_event_pickup ? 0 : Number(this.shippingCost || 0),
        rajaongkir_destination_id: this.is_event_pickup ? null : (this.selectedCity ? String(this.selectedCity.id) : null),
        shipping_cashback: this.is_event_pickup ? 0 : this.shippingCashback,
        voucher_code: this.voucherCode || "",
        items: Alpine.store("cart").items.map((i) => ({
          product_id: i.product_id,
          variant_id: i.variant_id || null,
          quantity: i.quantity,
          custom_code: i.custom_code || "",
        })),
      };

      this.isSubmitting = true;

      try {
        const backendUrl = this.getBackendUrl();
        let bodyPayload = payloadRaw;

        const encryptKey = (typeof process !== 'undefined' && process?.env?.MERCH_ENCRYPT_KEY) || null;
        if (window.CryptoJS && encryptKey) {
          const encryptedStr = CryptoJS.AES.encrypt(
            JSON.stringify(payloadRaw),
            encryptKey
          ).toString();
          bodyPayload = { payload: encryptedStr };
        }

        const res = await fetch(`${backendUrl}/api/v1/public/merch/checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(bodyPayload),
        });

        const json = await res.json();
        if (json.success && json.data) {
          this.orderResponse = json.data;
          Alpine.store("cart").clear();
          this.step = "qris";
          this.startQrisCountdown(json.data.expires_at);
          this.startPaymentPolling(json.data.order_id, json.data.status_token);
        } else {
          alert(json.message || "Failed to place order.");
        }
      } catch (err) {
        console.error("Order submission error:", err);
        alert("Server connection failed during checkout.");
      } finally {
        this.isSubmitting = false;
      }
    },

    startQrisCountdown(expiresAtStr) {
      clearInterval(this.timerInterval);
      const expiresAt = new Date(expiresAtStr).getTime();

      this.timerInterval = setInterval(() => {
        const now = new Date().getTime();
        const diff = expiresAt - now;

        if (diff <= 0) {
          this.handleQrisExpired();
        } else {
          const mins = Math.floor(diff / (1000 * 60));
          const secs = Math.floor((diff % (1000 * 60)) / 1000);
          this.timerDisplay = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
        }
      }, 1000);
    },

    startPaymentPolling(orderId, statusToken) {
      clearInterval(this.pollInterval);
      const backendUrl = this.getBackendUrl();

      this.pollInterval = setInterval(async () => {
        try {
          const res = await fetch(
            `${backendUrl}/api/v1/public/merch/order/${orderId}/status?token=${statusToken}`
          );
          const json = await res.json();
          if (json.success && json.data) {
            this.paymentStatus = json.data.status;
            if (json.data.status === "paid") {
              clearInterval(this.pollInterval);
              clearInterval(this.timerInterval);
              this.showExpiredPopup = false;
              this.step = "success";
            } else if (json.data.status === "expired" || json.data.status === "cancelled") {
              this.handleQrisExpired();
            }
          }
        } catch (err) {
          console.error("Polling error:", err);
        }
      }, 5000);
    },

    get QrImageUrl() {
      if (!this.orderResponse?.qr_string) return "";
      return `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
        this.orderResponse.qr_string
      )}`;
    },

    formatRupiah(val) {
      return "IDR " + Number(val || 0).toLocaleString("id-ID");
    },
  }));
});
