import { init, Tiktoken } from "@dqbd/tiktoken/lite/init";
import wasm from "@dqbd/tiktoken/lite/tiktoken_bg.wasm";
import cl100k from "@dqbd/tiktoken/encoders/cl100k_base.json";

const VERSION = "v2.6.0";

(async () => {
  // Prevent multiple injections
  if (window.__TC_INJECTED_EXACT__) return;
  window.__TC_INJECTED_EXACT__ = true;

  // Initialize tiktoken
  await init((imports) => WebAssembly.instantiate(wasm, imports));
  const enc = new Tiktoken(cl100k.bpe_ranks, cl100k.special_tokens, cl100k.pat_str);

  // Create the widget with improved SVG design
  const widget = document.createElement("div");
  widget.id = "tc_widget";
  widget.className = "tc-compact"; // Start in compact mode
  widget.setAttribute("role", "button");
  widget.setAttribute("aria-expanded", "false");
  widget.setAttribute("aria-label", "Token counter");

  widget.innerHTML = `
    <div id="tc_inner">
      <div id="tc_main">
        <div id="tc_bottle" aria-hidden="true">
          <svg viewBox="0 0 48 160" preserveAspectRatio="xMidYMid meet">
            <defs>
              <!-- Improved glass gradient -->
              <linearGradient id="tc_gloss_grad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stop-color="rgba(255,255,255,0.8)"/>
                <stop offset="30%" stop-color="rgba(255,255,255,0.4)"/>
                <stop offset="70%" stop-color="rgba(255,255,255,0.2)"/>
                <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
              </linearGradient>
              
              <!-- Bottle shadow gradient -->
              <linearGradient id="tc_shadow_grad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stop-color="rgba(0,0,0,0.1)"/>
                <stop offset="50%" stop-color="rgba(0,0,0,0.05)"/>
                <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
              </linearGradient>
              
              <!-- Liquid clip path - properly fitted to bottle -->
              <clipPath id="tc_clip">
                <path d="M16 22 L32 22 L34 24 L34 140 Q34 150 24 150 Q14 150 14 140 L14 24 Z"/>
              </clipPath>
            </defs>
            
            <!-- Bottle shadow -->
            <path d="M17 8 L31 8 L31 20 L33 22 L35 24 L35 140 Q35 152 24 152 Q13 152 13 140 L13 24 L15 22 L17 20 Z"
                  fill="url(#tc_shadow_grad)" opacity="0.3"/>
            
            <!-- Bottle outline -->
            <path d="M16 6 L32 6 L32 20 L34 22 L34 140 Q34 150 24 150 Q14 150 14 140 L14 22 L16 20 Z"
                  fill="none" stroke="currentColor" stroke-width="1.8" stroke-opacity="0.4"/>
            
            <!-- Bottle neck detail -->
            <rect x="20" y="6" width="8" height="14" rx="1" 
                  fill="none" stroke="currentColor" stroke-width="1.2" stroke-opacity="0.3"/>
            
            <!-- Liquid fill (animated) -->
            <rect id="tc_liquid" x="14" y="150" width="20" height="0"
                  clip-path="url(#tc_clip)" rx="2"/>
            
            <!-- Inner liquid highlight -->
            <rect id="tc_liquid_highlight" x="16" y="150" width="4" height="0"
                  clip-path="url(#tc_clip)" rx="1" fill="rgba(255,255,255,0.4)"/>
            
            <!-- Glass highlight -->
            <path id="tc_gloss" d="M16 24 L20 24 L20 140 L16 140 Z" 
                  fill="url(#tc_gloss_grad)" clip-path="url(#tc_clip)"/>
          </svg>
        </div>
        <div id="tc_value">0</div>
      </div>
      <div id="tc_ver">${VERSION}</div>
    </div>
  `;

  document.documentElement.appendChild(widget);

  // Create scroll map overlay to visualize user messages along the scrollbar
  const scrollMap = document.createElement("div");
  scrollMap.id = "tc_scrollmap";
  scrollMap.setAttribute("aria-hidden", "true");
  scrollMap.innerHTML = "<div class='tc-scroll-track'><div class='tc-scroll-thumb'></div><div class='tc-scroll-markers'></div></div>";
  document.documentElement.appendChild(scrollMap);

  const scrollMarkers = scrollMap.querySelector(".tc-scroll-markers");
  const scrollThumb = scrollMap.querySelector(".tc-scroll-thumb");

  // Get DOM elements
  const elValue = widget.querySelector("#tc_value");
  const elLiquid = widget.querySelector("#tc_liquid");
  const elLiquidHighlight = widget.querySelector("#tc_liquid_highlight");

  // Budget detection with improved pattern matching
  let budget = 32000;
  const detectBudget = () => {
    const candidates = Array.from(
      document.querySelectorAll(
        [
          "header",
          "nav",
          '[data-testid*="model"]',
          '[class*="model"]',
          '[aria-label*="Model"]',
          '[aria-label*="model"]',
          "[data-model]",
          ".model-selector",
          'button[role="combobox"]',
          '[role="menuitem"]',
        ].join(", ")
      )
    );

    const textContent = candidates
      .map((el) => (el.textContent || el.getAttribute("aria-label") || "").trim())
      .join(" | ");

    // More precise matching
    if (/ChatGPT\s*5\s+Thinking|5\s*Thinking|GPT-?5\s*Thinking/i.test(textContent)) {
      return 128000;
    }
    if (/ChatGPT\s*5(?!\s*Thinking)|GPT-?5(?!\s*Thinking)/i.test(textContent)) {
      return 32000;
    }

    return budget; // Keep current budget if no match
  };

  // Scroll map state and helpers
  let userMessageElements = [];
  let scrollContainer = null;
  let scrollListenerTarget = null;
  let conversationRoot = null;
  let scrollMapRaf = 0;
  let resizeRaf = 0;

  const isDocumentScrollContainer = (element) => {
    if (!element) return true;
    return (
      element === document.body ||
      element === document.documentElement ||
      element === document.scrollingElement
    );
  };

  const ensureConversationRoot = () => {
    if (conversationRoot && document.contains(conversationRoot)) {
      return conversationRoot;
    }

    const candidates = [
      document.querySelector("main section"),
      document.querySelector("main"),
      document.querySelector("[data-testid*='conversation']"),
      document.querySelector("#__next main"),
    ].filter(Boolean);

    conversationRoot =
      candidates.find((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }) || document.body;

    return conversationRoot;
  };

  const ensureScrollContainer = () => {
    if (scrollContainer && document.contains(scrollContainer)) {
      return scrollContainer;
    }

    const root = ensureConversationRoot();
    let current = root;
    while (current && current !== document.body) {
      const style = window.getComputedStyle(current);
      if (
        (style.overflowY === "auto" ||
          style.overflowY === "scroll" ||
          style.overflowY === "overlay") &&
        current.scrollHeight > current.clientHeight + 64
      ) {
        scrollContainer = current;
        break;
      }
      current = current.parentElement;
    }

    if (!scrollContainer) {
      scrollContainer =
        document.scrollingElement ||
        document.documentElement ||
        document.body;
    }

    return scrollContainer;
  };

  const getViewportHeight = (container) =>
    isDocumentScrollContainer(container)
      ? window.innerHeight ||
        document.documentElement.clientHeight ||
        document.body.clientHeight ||
        0
      : container.clientHeight || 0;

  const getScrollTop = (container) =>
    isDocumentScrollContainer(container)
      ? window.scrollY ||
        document.documentElement.scrollTop ||
        document.body.scrollTop ||
        0
      : container.scrollTop || 0;

  const setScrollTop = (container, top, smooth = true) => {
    const target = Math.max(0, top);
    const behavior = smooth ? { top: target, behavior: "smooth" } : { top: target };
    if (isDocumentScrollContainer(container)) {
      window.scrollTo(behavior);
    } else {
      container.scrollTo(behavior);
    }
  };

  const getNodeOffsetWithinContainer = (node, container) => {
    if (!node || !container) return 0;
    const rect = node.getBoundingClientRect();
    if (isDocumentScrollContainer(container)) {
      return (
        rect.top +
        (window.scrollY ||
          document.documentElement.scrollTop ||
          document.body.scrollTop ||
          0)
      );
    }
    const containerRect = container.getBoundingClientRect();
    return rect.top - containerRect.top + container.scrollTop;
  };

  const clearScrollMap = () => {
    scrollMap.classList.remove("tc-scrollmap-visible");
    scrollMarkers.innerHTML = "";
    scrollThumb.style.opacity = "0";
  };

  const updateScrollMapLayout = () => {
    const root = ensureConversationRoot();
    if (!root) {
      clearScrollMap();
      return false;
    }

    const rect = root.getBoundingClientRect();
    const viewportHeight =
      window.innerHeight || document.documentElement.clientHeight || 0;

    if (!viewportHeight || rect.height <= 0) {
      clearScrollMap();
      return false;
    }

    const safeTop = Math.max(16, Math.min(rect.top, viewportHeight - 120));
    const safeBottom = Math.min(
      viewportHeight - 16,
      Math.max(rect.bottom, safeTop + 120)
    );
    const height = Math.max(120, safeBottom - safeTop);

    scrollMap.style.top = `${Math.round(safeTop)}px`;
    scrollMap.style.height = `${Math.round(height)}px`;
    scrollMap.classList.add("tc-scrollmap-visible");

    return true;
  };

  const updateScrollThumb = (containerParam) => {
    const container = containerParam || ensureScrollContainer();
    if (!container) {
      scrollThumb.style.opacity = "0";
      return;
    }

    const trackHeight = scrollMap.getBoundingClientRect().height;
    const scrollHeight = container.scrollHeight || 0;
    const viewportHeight = getViewportHeight(container);

    if (!trackHeight || !scrollHeight || !viewportHeight) {
      scrollThumb.style.opacity = "0";
      return;
    }

    const maxScrollable = Math.max(1, scrollHeight - viewportHeight);
    const viewRatio = Math.min(1, viewportHeight / scrollHeight);
    const thumbHeight = Math.max(24, trackHeight * viewRatio);
    const scrollTop = getScrollTop(container);
    const scrollRatio =
      maxScrollable <= 0 ? 0 : Math.min(1, scrollTop / maxScrollable);
    const travelRange = Math.max(0, trackHeight - thumbHeight);
    const thumbTop = travelRange * scrollRatio;

    scrollThumb.style.height = `${Math.round(thumbHeight)}px`;
    scrollThumb.style.transform = `translateY(${Math.round(thumbTop)}px)`;
    scrollThumb.style.opacity = viewRatio >= 0.999 ? "0" : "1";
  };

  const updateActiveMarker = (containerParam) => {
    if (!userMessageElements.length) return;

    const container = containerParam || ensureScrollContainer();
    if (!container) return;

    const viewportHeight = getViewportHeight(container);
    const scrollTop = getScrollTop(container);
    const viewportBottom = scrollTop + viewportHeight;

    let activeIndex = -1;
    for (let index = 0; index < userMessageElements.length; index += 1) {
      const message = userMessageElements[index];
      if (!message.isConnected) continue;
      const rect = message.getBoundingClientRect();
      const messageHeight = Math.max(rect.height || 0, message.offsetHeight || 0);
      const messageTop = getNodeOffsetWithinContainer(message, container);
      const messageBottom = messageTop + messageHeight;
      if (messageBottom >= scrollTop && messageTop <= viewportBottom) {
        activeIndex = index;
        break;
      }
    }

    const markers = scrollMarkers.querySelectorAll(".tc-scroll-marker");
    markers.forEach((marker, index) => {
      marker.classList.toggle("tc-active", index === activeIndex);
    });
  };

  const handleScroll = () => {
    const container =
      (scrollContainer && document.contains(scrollContainer)
        ? scrollContainer
        : null) || ensureScrollContainer();
    updateScrollThumb(container);
    updateActiveMarker(container);
  };

  const ensureScrollListener = (container) => {
    const target = isDocumentScrollContainer(container) ? window : container;
    if (scrollListenerTarget === target) return;

    if (scrollListenerTarget) {
      scrollListenerTarget.removeEventListener("scroll", handleScroll);
    }

    target.addEventListener("scroll", handleScroll, { passive: true });
    scrollListenerTarget = target;
  };

  const renderScrollMarkers = (container) => {
    if (!userMessageElements.length) {
      clearScrollMap();
      return;
    }

    if (!updateScrollMapLayout()) {
      return;
    }

    ensureScrollListener(container);

    const trackHeight = scrollMap.getBoundingClientRect().height;
    const scrollHeight = container.scrollHeight || 0;
    const viewportHeight = getViewportHeight(container);

    if (!trackHeight || !scrollHeight || !viewportHeight) {
      clearScrollMap();
      return;
    }

    const maxScrollable = Math.max(1, scrollHeight - viewportHeight);
    scrollMarkers.innerHTML = "";

    userMessageElements.forEach((node, index) => {
      if (!node.isConnected || node.offsetHeight === 0) return;

      const offset = getNodeOffsetWithinContainer(node, container);
      const normalized =
        maxScrollable <= 0
          ? 0.5
          : Math.min(1, Math.max(0, offset / maxScrollable));

      const rect = node.getBoundingClientRect();
      const messageHeight = Math.max(rect.height || 0, node.offsetHeight || 0);
      const markerHeight = Math.max(
        6,
        Math.min(
          36,
          (messageHeight / Math.max(scrollHeight, 1)) * trackHeight * 1.25
        )
      );

      const marker = document.createElement("button");
      marker.type = "button";
      marker.className = "tc-scroll-marker";
      marker.dataset.index = String(index);
      marker.setAttribute("aria-label", `Jump to user message ${index + 1}`);
      marker.title = `User message ${index + 1}`;
      marker.style.height = `${Math.round(markerHeight)}px`;
      marker.style.top =
        maxScrollable <= 0
          ? `${Math.round((trackHeight - markerHeight) / 2)}px`
          : `calc(${(normalized * 100).toFixed(3)}% - ${Math.round(
              markerHeight / 2
            )}px)`;

      const scrollToMessage = (smooth) => {
        const containerForScroll = ensureScrollContainer();
        if (!containerForScroll) return;
        const targetOffset = getNodeOffsetWithinContainer(
          node,
          containerForScroll
        );
        const viewport = getViewportHeight(containerForScroll);
        const latestRect = node.getBoundingClientRect();
        const latestHeight = Math.max(
          latestRect.height || 0,
          node.offsetHeight || 0
        );
        const desired =
          targetOffset - viewport / 2 + Math.min(latestHeight, viewport) / 2;
        setScrollTop(containerForScroll, desired, smooth);
      };

      marker.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        scrollToMessage(true);
      });

      marker.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          event.stopPropagation();
          scrollToMessage(false);
        }
      });

      scrollMarkers.appendChild(marker);
    });

    updateActiveMarker(container);
  };

  const scheduleScrollMapRender = () => {
    cancelAnimationFrame(scrollMapRaf);
    scrollMapRaf = requestAnimationFrame(() => {
      const container = ensureScrollContainer();
      if (!container || !userMessageElements.length) {
        clearScrollMap();
        return;
      }
      renderScrollMarkers(container);
      updateScrollThumb(container);
      updateActiveMarker(container);
    });
  };

  const handleResize = () => {
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      scheduleScrollMapRender();
    });
  };

  const extractUserMessages = (nodes) => {
    if (!nodes || !nodes.length) return [];

    const seen = new Set();
    const result = [];

    nodes.forEach((node) => {
      if (!(node instanceof Element)) return;

      const containerCandidate = node.matches("[data-message-author-role]")
        ? node
        : node.closest("[data-message-author-role]");

      const target =
        containerCandidate ||
        node.closest("[data-testid*='conversation-turn']") ||
        node.closest("article[data-testid*='conversation']");

      if (!target || seen.has(target)) return;

      const role = target.getAttribute("data-message-author-role");
      const testId = target.getAttribute("data-testid") || "";

      if (role && role.toLowerCase() === "user") {
        if (target.offsetHeight > 0) {
          seen.add(target);
          result.push(target);
        }
        return;
      }

      if (!role && /user/i.test(testId) && target.offsetHeight > 0) {
        seen.add(target);
        result.push(target);
      }
    });

    result.sort(
      (a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top
    );

    return result;
  };

  const scheduleScrollMapUpdate = (messageNodes) => {
    userMessageElements = extractUserMessages(messageNodes);
    if (!userMessageElements.length) {
      clearScrollMap();
      return;
    }
    scheduleScrollMapRender();
  };

  window.addEventListener("resize", handleResize);

  // Improved text gathering with better cleaning
  const getAllMessageNodes = () => {
    const selectors = [
      "[data-message-author-role]",
      "[data-message-id] .prose",
      "[data-message-id] .markdown",
      ".message-content",
      ".conversation-turn",
      "article[data-testid*='conversation']",
      ".text-message",
      ".markdown.prose",
    ];

    const nodes = new Set();
    selectors.forEach((selector) => {
      document.querySelectorAll(selector).forEach((node) => {
        // Skip hidden or empty nodes
        if (node.offsetHeight === 0 || !node.textContent?.trim()) return;
        // Skip if it's inside another already selected node
        const isNested = Array.from(nodes).some(
          (existing) => existing.contains(node) || node.contains(existing)
        );
        if (!isNested) nodes.add(node);
      });
    });

    return Array.from(nodes);
  };

  const getInputText = () => {
    const inputs = document.querySelectorAll("textarea, [contenteditable='true']");
    return Array.from(inputs)
      .map((input) => input.value || input.textContent || "")
      .join("\n")
      .trim();
  };

  const getText = (messageNodesOverride) => {
    const messageNodes = messageNodesOverride || getAllMessageNodes();
    const messageText = messageNodes
      .map((node) => {
        let text = node.innerText || node.textContent || "";
        // Clean up common artifacts
        text = text
          .replace(/\n{3,}/g, "\n\n") // Multiple newlines to double
          .replace(/\s+/g, " ") // Multiple spaces to single
          .replace(/^\s*Copy code\s*/gm, "") // Remove "Copy code" buttons
          .replace(/^\s*\d+\s*$/gm, "") // Remove standalone numbers (line numbers)
          .trim();
        return text;
      })
      .filter((text) => text.length > 5) // Filter out very short fragments
      .join("\n\n");

    const inputText = getInputText();

    const fullText = [messageText, inputText].filter(Boolean).join("\n\n");

    // Final cleanup
    return fullText.replace(/\n{3,}/g, "\n\n").trim();
  };

  // Enhanced bottle animation
  const updateBottle = (tokens) => {
    const percentage = Math.max(0, Math.min(1, tokens / budget));

    // Bottle dimensions: top=24, bottom=150, height=126
    const liquidTop = 24;
    const liquidBottom = 150;
    const maxHeight = liquidBottom - liquidTop;

    const fillHeight = Math.round(maxHeight * percentage);
    const yPosition = liquidBottom - fillHeight;

    // Smooth height animation
    elLiquid.style.y = `${yPosition}px`;
    elLiquid.style.height = `${Math.max(0, fillHeight)}px`;

    // Synchronized highlight animation
    elLiquidHighlight.style.y = `${yPosition}px`;
    elLiquidHighlight.style.height = `${Math.max(0, fillHeight)}px`;

    // Color state management
    widget.classList.remove("tc-mid", "tc-high", "tc-danger");

    if (percentage >= 0.95) {
      widget.classList.add("tc-danger");
    } else if (percentage >= 0.75) {
      widget.classList.add("tc-high");
    } else if (percentage >= 0.2) {
      widget.classList.add("tc-mid");
    }
    // Default green for < 20%
  };

  // Smooth number animation with faster easing for immediate updates
  let animationId = 0;
  let currentDisplayValue = 0;

  // Format token display based on mode
  const formatTokenDisplay = (value) => {
    if (widget.classList.contains("tc-compact") && value >= 10000) {
      const roundedOneDecimalK = Math.round((value / 1000) * 10) / 10;
      return `${roundedOneDecimalK.toFixed(1)}k`;
    }
    return value.toLocaleString();
  };

  const animateValueTo = (targetValue, immediate = false) => {
    const startValue = currentDisplayValue;
    const difference = targetValue - startValue;

    // If change is small or immediate update requested, skip animation
    if (Math.abs(difference) <= 2 || immediate) {
      elValue.textContent = formatTokenDisplay(targetValue);
      currentDisplayValue = targetValue;
      return;
    }

    const duration = Math.min(300, Math.abs(difference) * 2); // Adaptive duration
    const startTime = performance.now();

    cancelAnimationFrame(animationId);

    const animate = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Cubic ease-out for smooth deceleration
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      const currentValue = Math.round(startValue + difference * easedProgress);

      elValue.textContent = formatTokenDisplay(currentValue);

      if (progress < 1) {
        animationId = requestAnimationFrame(animate);
      } else {
        currentDisplayValue = targetValue;
      }
    };

    animationId = requestAnimationFrame(animate);
  };

  // Debug function to check token counting accuracy
  const debugTokenCount = () => {
    const text = getText();
    const tokenCount = enc.encode(text).length;
    const charCount = text.length;
    const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;

    console.group("Token Counter Debug");
    console.log("Text length (chars):", charCount);
    console.log("Word count:", wordCount);
    console.log("Token count:", tokenCount);
    console.log("Tokens per word (avg):", (tokenCount / Math.max(wordCount, 1)).toFixed(2));
    console.log("Budget:", budget.toLocaleString());
    console.log("Usage:", ((tokenCount / budget) * 100).toFixed(1) + "%");
    console.log("Text preview:", text.slice(0, 200) + (text.length > 200 ? "..." : ""));
    console.groupEnd();

    return { text, tokenCount, charCount, wordCount };
  };

  // Add debug method to widget for manual testing
  widget.debugTokenCount = debugTokenCount;

  // Main update function with debouncing
  let lastSignature = "";
  let updateTimeout = null;

  const performUpdate = () => {
    const newBudget = detectBudget();
    if (newBudget !== budget) {
      budget = newBudget;
      console.log(`Token Counter: Budget updated to ${budget.toLocaleString()}`);
    }

    const messageNodes = getAllMessageNodes();
    scheduleScrollMapUpdate(messageNodes);

    const text = getText(messageNodes);
    const signature = `${budget}:${text.length}:${text.slice(-100)}`;

    if (signature === lastSignature) return;
    lastSignature = signature;

    try {
      const tokenCount = enc.encode(text).length;
      const isSmallChange = Math.abs(tokenCount - currentDisplayValue) <= 5;
      animateValueTo(tokenCount, isSmallChange);
      updateBottle(tokenCount);

      // Update token count size class
      let tokenSizeClass = "small";
      if (tokenCount >= 100000) {
        tokenSizeClass = "xlarge";
      } else if (tokenCount >= 1000) {
        tokenSizeClass = "large";
      }
      widget.setAttribute("data-tokens", tokenSizeClass);

      // Show/hide widget based on content
      if (text.trim().length > 0) {
        widget.classList.add("tc-show");
      } else {
        widget.classList.remove("tc-show");
      }
    } catch (error) {
      console.error("Token Counter: Encoding error:", error);
    }
  };

  const debouncedUpdate = () => {
    clearTimeout(updateTimeout);
    updateTimeout = setTimeout(performUpdate, 50); // Reduced from 100ms
  };

  // Immediate update for input events
  const immediateUpdate = () => {
    clearTimeout(updateTimeout);
    performUpdate();
  };

  // Toggle functionality with improved UX for three modes
  const cycleMode = () => {
    if (widget.classList.contains("tc-collapsed")) {
      // Collapsed -> Compact
      widget.classList.remove("tc-collapsed");
      widget.classList.add("tc-compact");
      widget.setAttribute("aria-expanded", "false");
    } else if (widget.classList.contains("tc-compact")) {
      // Compact -> Expanded
      widget.classList.remove("tc-compact");
      widget.classList.add("tc-expanded");
      widget.setAttribute("aria-expanded", "true");
    } else {
      // Expanded -> Collapsed
      widget.classList.remove("tc-expanded");
      widget.classList.add("tc-collapsed");
      widget.setAttribute("aria-expanded", "false");
    }
  };

  // Click handler with haptic feedback (if supported)
  widget.addEventListener("click", (e) => {
    e.stopPropagation();

    // Provide haptic feedback on mobile devices
    if ("vibrate" in navigator) {
      navigator.vibrate(50);
    }

    cycleMode();
  });

  // Enhanced observation setup
  const observationRoot = document.querySelector("main") || document.body;

  // MutationObserver for DOM changes
  const mutationObserver = new MutationObserver(debouncedUpdate);
  mutationObserver.observe(observationRoot, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: false, // Reduce noise
  });

  // Multiple input event listeners for real-time typing
  const inputEvents = ["input", "keyup", "paste", "cut"];
  inputEvents.forEach((eventType) => {
    document.addEventListener(eventType, immediateUpdate, { passive: true });
  });

  // Focus events to catch when user starts/stops typing
  document.addEventListener("focusin", immediateUpdate, { passive: true });
  document.addEventListener("focusout", debouncedUpdate, { passive: true });

  // Periodic updates for edge cases (reduced frequency)
  const intervalId = setInterval(performUpdate, 1000); // Reduced from 2000ms

  // Cleanup function
  const cleanup = () => {
    try {
      mutationObserver.disconnect();
      clearInterval(intervalId);
      clearTimeout(updateTimeout);
      cancelAnimationFrame(animationId);
      enc.free();
      document.removeEventListener("input", debouncedUpdate);
      if (scrollListenerTarget) {
        scrollListenerTarget.removeEventListener("scroll", handleScroll);
        scrollListenerTarget = null;
      }
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(scrollMapRaf);
      cancelAnimationFrame(resizeRaf);
      userMessageElements = [];
      scrollContainer = null;
      conversationRoot = null;
      if (scrollMap.parentElement) {
        scrollMap.parentElement.removeChild(scrollMap);
      }
    } catch (error) {
      console.warn("Token Counter: Cleanup error:", error);
    }
  };

  // Register cleanup
  window.addEventListener("beforeunload", cleanup);

  // Also cleanup if the widget is removed
  const cleanupObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.removedNodes.forEach((node) => {
        if (node === widget) {
          cleanup();
          cleanupObserver.disconnect();
        }
      });
    });
  });

  cleanupObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  // Initial update
  performUpdate();

  console.log(`Token Counter ${VERSION} loaded successfully`);
  console.log('Debug: Use document.getElementById("tc_widget").debugTokenCount() to check token counting');
})();
