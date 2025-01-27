/**
 * Nautilus Trusted Compute
 * Copyright (C) 2025 Nautilus
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published
 * by the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

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
