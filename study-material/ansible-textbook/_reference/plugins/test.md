---
title: Test plugins
product: ansible
source_url: https://docs.ansible.com/ansible/latest/plugins/test.html
source_path: ansible/ansible-documentation:docs/docsite/rst/plugins/test.rst
---

# Test plugins

Test plugins evaluate template expressions and return True or False. With test plugins you can create [conditionals](../../playbook_guide/playbooks_conditionals.md) to implement the logic of your tasks, blocks, plays, playbooks, and roles. Ansible uses the [standard tests](https://jinja.palletsprojects.com/en/latest/templates/#builtin-tests) shipped as part of Jinja and adds some specialized test plugins. You can create custom Ansible test plugins.

## Enabling test plugins

You can add a custom test plugin by dropping it into a `test_plugins` directory adjacent to your play, inside a role, or by putting it in one of the test plugin directory sources configured in ansible.cfg.

## Using test plugins

You can use tests anywhere you can use templating in Ansible: in a play, in a variables file, or in a Jinja2 template for the template module. For more information on using test plugins, see [Tests](../../playbook_guide/playbooks_tests.md).

Tests always return `True` or `False`, they are always a boolean, if you need a different return type, you should be looking at filters.

You can recognize test plugins by the use of the `is` statement in a template, they can also be used as part of the `select` family of filters.

``` yaml+jinja
vars:
  is_ready: '{{ task_result is success }}'

tasks:
- name: conditionals are always in 'template' context
  action: dostuff
  when: task_result is failed
```

Tests will always have an `_input` and this is normally what is on the left side of `is`. Tests can also take additional parameters as you would to most programming functions. These parameters can be either `positional` (passed in order) or `named` (passed as key=value pairs). When passing both types, positional arguments should go first.

``` yaml+jinja
tasks:
- name: pass a positional parameter to match test
  action: dostuff
  when: myurl is match("https://example.com/users/.*/resources")

- name: pass named parameter to truthy test
  action: dostuff
  when: myvariable is truthy(convert_bool=True)

- name: pass both types to 'version' test
  action: dostuff
  when: sample_semver_var is version('2.0.0-rc.1+build.123', 'lt', version_type='semver')
```

### Using test plugins with lists

As mentioned above, one way to use tests is with the `select` family of filters (`select`, `reject`, `selectattr`, `rejectattr`).

``` yaml+jinja
# give me only defined variables from a list of variables, using 'defined' test
good_vars: "{{ all_vars|select('defined') }}"

# this uses the 'equalto' test to filter out non 'fixed' type of addresses from a list
only_fixed_addresses:  "{{ all_addresses|selectattr('type', 'equalto', 'fixed') }}"

# this does the opposite of the previous one
only_fixed_addresses:  "{{ all_addresses|rejectattr('type', 'equalto', 'fixed') }}"
```

## Plugin list

You can use `ansible-doc -t test -l` to see the list of available plugins. Use `ansible-doc -t test <plugin name>` to see plugin-specific documentation and examples.


> [!NOTE]
>
> See also
> [Ansible playbooks](../../playbook_guide/playbooks_intro.md)
> An introduction to playbooks
> [Tests](../../playbook_guide/playbooks_tests.md)
> Using tests
> [Conditionals](../../playbook_guide/playbooks_conditionals.md)
> Using conditional statements
> [Filter plugins](filter.md)
> Filter plugins
> [Tests](../../playbook_guide/playbooks_tests.md)
> Using tests
> [Lookup plugins](lookup.md)
> Lookup plugins
> Communication
> Got questions? Need help? Want to share your ideas? Visit the Ansible communication guide
