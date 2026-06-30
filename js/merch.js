/* SOD Festival Merchandise Alpine.js Application Script */

document.addEventListener("alpine:init", () => {
  // 1. Global Cart Store (persisted in localStorage)
  Alpine.store("cart", {
    items: JSON.parse(localStorage.getItem("sod_merch_cart") || "[]"),
    
    save() {
      localStorage.setItem("sod_merch_cart", JSON.stringify(this.items));
    },

    addItem(product) {
      const existing = this.items.find((i) => i.product_id === product.id);
      if (existing) {
        if (existing.quantity < product.quantity) {
          existing.quantity++;
        } else {
          alert(`Maximum available stock reached (${product.quantity})`);
        }
      } else {
        this.items.push({
          product_id: product.id,
          title: product.title,
          price: Number(product.price),
          photo: product.photo,
          merchant_id: product.merchant_id,
          merchant_name: product.merchant_name,
          quantity: 1,
          stock: product.quantity,
        });
      }
      this.save();
    },

    removeItem(productId) {
      this.items = this.items.filter((i) => i.product_id !== productId);
      this.save();
    },

    updateQuantity(productId, qty) {
      const item = this.items.find((i) => i.product_id === productId);
      if (item) {
        if (qty <= 0) {
          this.removeItem(productId);
        } else if (qty <= item.stock) {
          item.quantity = qty;
          this.save();
        } else {
          alert(`Maximum available stock reached (${item.stock})`);
        }
      }
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
    loading: true,
    error: null,
    backendUrl: "http://localhost:3003", // Default local backend

    async init() {
      // Auto-detect backend URL if configured or default
      if (window.location.origin.includes("sodtix.com") || window.location.origin.includes("sodfestival")) {
        this.backendUrl = window.location.origin.replace("sodfestival.com", "sodtix.com");
      }
      await this.fetchProducts();
    },

    async fetchProducts() {
      this.loading = true;
      try {
        const res = await fetch(`${this.backendUrl}/api/v1/public/merch/products?merchant_code=sodfestival`);
        const json = await res.json();
        if (json.success) {
          this.products = json.data;
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

    formatRupiah(val) {
      return "IDR " + Number(val || 0).toLocaleString("id-ID");
    },

    getImageUrl(path) {
      if (!path) return "img/sodfavicon.png";
      if (path.startsWith("http")) return path;
      return `${this.backendUrl}${path}`;
    },
  }));

  // 3. Checkout & Payment Modal Component
  Alpine.data("checkoutModal", () => ({
    showModal: false,
    showPaymentModal: false,
    step: "checkout", // 'checkout', 'qris', 'success'

    // Form Fields
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    shipping_address: "",
    
    // City Search
    cityQuery: "",
    citySearchResults: [],
    selectedCity: null,
    isSearchingCity: false,

    // Courier & Service
    courier: "jne",
    service: "",
    availableServices: [],
    shippingCost: 0,
    isCalculatingShipping: false,

    // Order & QRIS state
    isSubmitting: false,
    orderResponse: null,
    paymentStatus: "pending",
    timerDisplay: "15:00",
    pollInterval: null,
    timerInterval: null,

    init() {
      // Watch for city query input changes to perform debounced search
      this.$watch("cityQuery", (val) => {
        if (!val || val.length < 2 || (this.selectedCity && this.selectedCity.label === val)) {
          this.citySearchResults = [];
          return;
        }
        this.searchCityDebounced(val);
      });
    },

    openCheckout() {
      if (Alpine.store("cart").items.length === 0) {
        alert("Your cart is empty!");
        return;
      }
      this.showModal = true;
      this.step = "checkout";
    },

    closeCheckout() {
      this.showModal = false;
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
      const label = item.label || item.destination_name || `${item.city_name || item.name}, ${item.province_name || ''}`;
      this.cityQuery = label;
      this.citySearchResults = [];
      this.calculateShippingCost();
    },

    async calculateShippingCost() {
      if (!this.selectedCity || !this.courier) return;
      
      const cityId = this.selectedCity.id || this.selectedCity.city_id || this.selectedCity.destination_id;
      if (!cityId) return;

      const cartItems = Alpine.store("cart").items;
      // Estimate 500g per item if weight not specified
      const totalWeight = cartItems.reduce((sum, i) => sum + (i.weight || 500) * i.quantity, 0);

      this.isCalculatingShipping = true;
      this.availableServices = [];
      this.shippingCost = 0;
      this.service = "";

      try {
        const backendUrl = this.getBackendUrl();
        const res = await fetch(`${backendUrl}/api/v1/public/merch/shipping/calculate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            origin: "501", // Default origin or from merchant
            destination: String(cityId),
            weight: totalWeight,
            courier: this.courier,
          }),
        });
        const json = await res.json();
        
        if (json.success && json.data) {
          const results = json.data.results || json.data || [];
          if (results.length > 0 && results[0].costs) {
            this.availableServices = results[0].costs;
            if (this.availableServices.length > 0) {
              this.selectService(this.availableServices[0]);
            }
          }
        }
      } catch (err) {
        console.error("Calculate shipping cost error:", err);
      } finally {
        this.isCalculatingShipping = false;
      }
    },

    selectService(srvObj) {
      if (typeof srvObj === "string") {
        srvObj = this.availableServices.find((s) => s.service === srvObj) || srvObj;
      }
      if (srvObj && srvObj.cost && srvObj.cost.length > 0) {
        this.service = srvObj.service;
        this.shippingCost = Number(srvObj.cost[0].value);
      }
    },

    getBackendUrl() {
      if (window.location.origin.includes("sodtix.com") || window.location.origin.includes("sodfestival")) {
        return window.location.origin.replace("sodfestival.com", "sodtix.com");
      }
      return "http://localhost:3001";
    },

    async submitOrder() {
      if (!this.customer_name || !this.customer_email || !this.customer_phone || !this.shipping_address) {
        alert("Please complete all customer and address fields.");
        return;
      }
      if (!this.selectedCity) {
        alert("Please select a valid destination city.");
        return;
      }

      const cityId = this.selectedCity.id || this.selectedCity.city_id || this.selectedCity.destination_id;

      const payloadRaw = {
        customer_name: this.customer_name,
        customer_email: this.customer_email,
        customer_phone: this.customer_phone,
        shipping_address: this.shipping_address,
        shipping_city_id: String(cityId),
        shipping_city_name: this.selectedCity.city_name || this.selectedCity.name || this.cityQuery,
        shipping_province: this.selectedCity.province_name || "",
        shipping_courier: this.courier,
        shipping_service: this.service || "REG",
        items: Alpine.store("cart").items.map((i) => ({
          product_id: i.product_id,
          quantity: i.quantity,
        })),
      };

      this.isSubmitting = true;

      try {
        const backendUrl = this.getBackendUrl();
        let bodyPayload = payloadRaw;

        // Optional CryptoJS AES payload encryption if library loaded
        if (window.CryptoJS && process?.env?.MERCH_ENCRYPT_KEY) {
          const encryptedStr = CryptoJS.AES.encrypt(
            JSON.stringify(payloadRaw),
            process.env.MERCH_ENCRYPT_KEY
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
          Alpine.store("cart").clear(); // Clear cart after order placement
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
          clearInterval(this.timerInterval);
          this.timerDisplay = "EXPIRED";
          this.paymentStatus = "expired";
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
              this.step = "success";
            } else if (json.data.status === "expired" || json.data.status === "cancelled") {
              clearInterval(this.pollInterval);
              clearInterval(this.timerInterval);
            }
          }
        } catch (err) {
          console.error("Polling error:", err);
        }
      }, 4000); // poll every 4 seconds
    },

    get QrImageUrl() {
      if (!this.orderResponse?.qr_string) return "";
      // Generate Google Chart API or QR image URL from string
      return `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
        this.orderResponse.qr_string
      )}`;
    },

    formatRupiah(val) {
      return "IDR " + Number(val || 0).toLocaleString("id-ID");
    },
  }));
});
