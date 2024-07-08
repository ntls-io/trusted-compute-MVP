const body = document.body;
const ClassName = {
  COLLAPSED: "sidebar-collapse",
  OPEN: "sidebar-open",
  CLOSED: "sidebar-closed"
};
const pushMenu = {
  data: () => {
    return {
      autoCollapseSize: 992
    };
  },
  created() {
    this.autoCollapse();
  },
  mounted() {
    window.addEventListener("resize", () => {
      this.autoCollapse(true);
    });
  },
  destroyed() {
    window.removeEventListener("resize", () => {});
  },
  methods: {
    classList(elt) {
      const list = elt.classList;

      return {
        toggle: function (c) {
          list.toggle(c);
          return this;
        },
        add: function (c) {
          list.add(c);
          return this;
        },
        remove: function (c) {
          list.remove(c);
          return this;
        }
      };
    },
    autoCollapse(resize) {
      if (resize === undefined) {
        resize = false;
      }

      if (this.autoCollapseSize) {
        if (window.innerWidth <= this.autoCollapseSize) {
          if (!body.classList.contains(ClassName.OPEN)) {
            this.collapse();
          }
        } else if (resize === true) {
          if (body.classList.contains(ClassName.OPEN)) {
            this.classList(body).remove(ClassName.OPEN);
          } else if (body.classList.contains(ClassName.CLOSED)) {
            this.expand();
          }
        }
      }
    },
    collapse() {
      if (this.autoCollapseSize) {
        if (window.innerWidth <= this.autoCollapseSize) {
          this.classList(body).remove(ClassName.OPEN).add(ClassName.CLOSED);
        }
      }

      this.classList(body).add(ClassName.COLLAPSED);
    },
    expand() {
      if (this.autoCollapseSize) {
        if (window.innerWidth <= this.autoCollapseSize) {
          this.classList(body).add(ClassName.OPEN);
        }
      }

      this.classList(body).remove(ClassName.COLLAPSED).remove(ClassName.CLOSED);
    },
    toggle() {
      if (!body.classList.contains(ClassName.COLLAPSED)) {
        this.collapse();
      } else {
        this.expand();
      }

      //   this.classList(body)
      //     .toggle("sidebar-collapse")
      //     .toggle("sidebar-open");
    }
  }
};

export default pushMenu;
