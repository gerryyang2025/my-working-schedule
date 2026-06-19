import { mount } from "@vue/test-utils";
import { defineComponent } from "vue";
import { describe, expect, it } from "vitest";
import LoginPage from "./LoginPage.vue";

const ElButtonStub = defineComponent({
  name: "ElButton",
  props: ["disabled", "loading"],
  template: '<button type="submit" :disabled="disabled"><slot /></button>'
});

const ElInputStub = defineComponent({
  name: "ElInput",
  props: ["modelValue", "placeholder", "type", "disabled"],
  emits: ["update:modelValue"],
  template:
    '<input :data-testid="$attrs[\'data-testid\']" :placeholder="placeholder" :type="type" :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', $event.target.value)" />'
});

describe("LoginPage", () => {
  it("submits username and password and shows login errors", async () => {
    const wrapper = mount(LoginPage, {
      props: {
        loading: false,
        error: "用户名或密码不正确"
      },
      global: {
        stubs: {
          ElButton: ElButtonStub,
          ElInput: ElInputStub
        }
      }
    });

    expect(wrapper.get('[data-testid="login-username"]').element).toHaveProperty("value", "admin");
    expect(wrapper.get('[role="alert"]').text()).toBe("用户名或密码不正确");

    await wrapper.get('[data-testid="login-password"]').setValue("secret");
    await wrapper.get("form").trigger("submit");

    expect(wrapper.emitted("login")).toEqual([[{ username: "admin", password: "secret" }]]);
  });
});
